/** @jsxImportSource @opentui/solid */
import { spawn } from "node:child_process"
import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import { RGBA, type ScrollBoxRenderable } from "@opentui/core"
import type { TuiPluginApi, TuiPromptRef } from "@opencode-ai/plugin/tui"
import type { PromptContext } from "../../prompt/types"
import { ensureSnippetDraft, loadSnippets } from "./loader"
import { loadSkills } from "./skill-loader"
import { addPendingDraft, markSnippetReloadRequested } from "./state"
import { describeSkill, describeSnippet, filterSkills, filterSnippets, highlightMatches, matchedAliases } from "./search"
import { findTrailingHashtagTrigger, insertSkillLoad, insertSnippetTag, insertSnippetTrigger, isReloadCommand, preferredSnippetTag, stepSelection } from "./trigger"
import type { AutocompleteItem, SnippetController, SnippetInfo } from "./types"

const PROMPT_SYNC_MS = 50
const MENU_MAX_HEIGHT = 10
const MOUSE_HOVER_SUPPRESS_MS = 150
const INLINE_BORDER = {
    border: ["left", "right"] as Array<"left" | "right">,
    customBorderChars: {
        topLeft: "",
        bottomLeft: "",
        vertical: "┃",
        topRight: "",
        bottomRight: "",
        horizontal: " ",
        bottomT: "",
        topT: "",
        cross: "",
        leftT: "",
        rightT: "",
    },
}

type SnippetAutocompleteProps = {
    ctx: PromptContext
    controller: SnippetController
}

type InputMode = "keyboard" | "mouse"

export function SnippetAutocomplete(props: SnippetAutocompleteProps) {
    const [snippets, setSnippets] = createSignal<SnippetInfo[]>([])
    const [skills, setSkills] = createSignal<Awaited<ReturnType<typeof loadSkills>>>([])
    const [loading, setLoading] = createSignal(true)
    const [input, setInput] = createSignal("")
    const [syncingPrompt, setSyncingPrompt] = createSignal(false)
    const [menuEpoch, setMenuEpoch] = createSignal(0)
    const [selected, setSelected] = createSignal(0)
    const [dismissed, setDismissed] = createSignal<string>()
    const [inputMode, setInputMode] = createSignal<InputMode>("keyboard")
    const [ignoreMouseUntil, setIgnoreMouseUntil] = createSignal(0)
    const [lastMousePos, setLastMousePos] = createSignal<{ x: number; y: number }>()
    const [creating, setCreating] = createSignal(false)
    const [dialogOpen, setDialogOpen] = createSignal(false)
    const [dialogHandoffUntil, setDialogHandoffUntil] = createSignal(0)

    let syncInterval: ReturnType<typeof setInterval> | undefined
    let pendingPromptSync: ReturnType<typeof setTimeout> | undefined
    let pendingPromptFocus: ReturnType<typeof setTimeout> | undefined
    let pendingDialogHandoff: ReturnType<typeof setTimeout> | undefined
    let commandTimer: ReturnType<typeof setTimeout> | undefined
    let commandDispose: (() => void) | undefined
    let disposed = false
    let scroll: ScrollBoxRenderable | undefined

    const refresh = async () => {
        setLoading(true)
        try {
            const [nextSnippets, nextSkills] = await Promise.all([loadSnippets(props.ctx.api.state.path.directory), loadSkills(props.ctx.api.state.path.directory)])
            if (!disposed) {
                setSnippets(nextSnippets)
                setSkills(nextSkills)
            }
        } finally {
            if (!disposed) setLoading(false)
        }
    }

    void refresh()

    syncInterval = setInterval(() => {
        const ref = props.ctx.prompt()
        if (!ref) {
            setInput("")
            setSyncingPrompt(false)
            return
        }
        setInput(ref.current.input ?? "")
    }, PROMPT_SYNC_MS)

    onCleanup(() => {
        disposed = true
        if (syncInterval) clearInterval(syncInterval)
        if (pendingPromptSync) clearTimeout(pendingPromptSync)
        if (pendingPromptFocus) clearTimeout(pendingPromptFocus)
        if (pendingDialogHandoff) clearTimeout(pendingDialogHandoff)
        if (commandTimer) clearTimeout(commandTimer)
        commandDispose?.()
        props.controller.accept = undefined
        props.controller.reload = undefined
        props.controller.insertTrigger = undefined
    })

    const dialogBlockingInput = () => dialogOpen() || dialogHandoffUntil() > Date.now()
    const match = createMemo(() => {
        if (props.ctx.disabled || props.ctx.visible === false) return undefined
        return findTrailingHashtagTrigger(input())
    })
    const query = createMemo(() => match()?.query.trim() ?? "")
    const options = createMemo(() => (match() ? optionsForQuery(query()) : []))
    const draftName = createMemo(() => normalizeSnippetName(query()))
    const canCreate = createMemo(() => !loading() && options().length === 0 && query().length > 0 && draftName().length > 0)
    const visible = createMemo(() => !!match() && !syncingPrompt() && dismissed() !== match()?.token)
    const menuVisible = createMemo(() => visible() && (options().length > 0 || canCreate()))
    const menuHeight = createMemo(() => Math.min(MENU_MAX_HEIGHT, Math.max(1, options().length || 1)))
    const selectedFg = createMemo(() => selectedText(props.ctx.api.theme.current))
    const activeRowId = createMemo(() => options()[selected()]?.id ?? (canCreate() ? "create-snippet" : undefined))
    const optionKey = createMemo(() => options().map((option) => option.id).join("\n"))

    createEffect(() => {
        menuEpoch()
        if (visible()) scroll = undefined
    })

    createEffect(() => {
        match()?.token
        optionKey()
        setSelected(0)
        lockKeyboardSelection()
        setTimeout(() => {
            scroll?.scrollTo(0)
            const first = activeRowId()
            if (first) scroll?.scrollChildIntoView(first)
        }, 0)
    })

    createEffect(() => {
        const row = activeRowId()
        if (row) scroll?.scrollChildIntoView(row)
    })

    const chooseItem = (item: AutocompleteItem) => {
        const ref = props.ctx.prompt()
        if (!ref) return false
        const next = item.kind === "skill" ? insertSkillLoad(ref.current.input, item.skill.name) : insertSnippetTag(ref.current.input, preferredSnippetTag(ref.current.input, item.snippet))
        syncPromptInput(ref, next)
        setDismissed(undefined)
        ref.focus()
        props.ctx.requestRender()
        return true
    }

    const choose = (index = selected()) => {
        const item = options()[index]
        return item ? chooseItem(item) : false
    }

    const accept = () => {
        const ref = props.ctx.prompt()
        if (!ref) return false

        if (isReloadCommand(ref.current.input)) {
            void executeReloadInPrompt(ref)
            return true
        }

        if (dialogBlockingInput()) return true

        const current = findTrailingHashtagTrigger(ref.current.input)
        if (!current || dismissed() === current.token) return false

        const live = optionsForQuery(current.query.trim())
        const liveIndex = Math.min(selected(), Math.max(live.length - 1, 0))

        if (syncingPrompt()) {
            if (live.length > 0) {
                chooseItem(live[liveIndex] ?? live[0])
                return true
            }
            if (canCreateForQuery(current.query)) {
                void createSnippetDraft(current.query)
                return true
            }
            return false
        }

        if (visible() && options().length > 0) {
            choose(Math.min(selected(), options().length - 1))
            return true
        }

        if (loading()) return true

        if (live.length > 0) {
            chooseItem(live[liveIndex] ?? live[0])
            return true
        }

        if (canCreateForQuery(current.query)) {
            void createSnippetDraft(current.query)
            return true
        }

        return false
    }

    props.controller.accept = accept
    props.controller.reload = () => {
        const ref = props.ctx.prompt()
        if (ref) void executeReloadInPrompt(ref)
    }
    props.controller.insertTrigger = () => {
        const ref = props.ctx.prompt()
        if (!ref) return
        syncPromptInput(ref, insertSnippetTrigger(ref.current.input))
        ref.focus()
    }

    createEffect(() => {
        const ref = props.ctx.prompt()
        if (!ref) return

        if (commandTimer) clearTimeout(commandTimer)
        commandDispose?.()
        commandDispose = undefined

        commandTimer = setTimeout(() => {
            commandTimer = undefined
            if (disposed) return

            commandDispose = props.ctx.api.command.register(() => [
                {
                    title: "Reload snippets",
                    value: "snippets.reload",
                    description: "Reload snippet files from disk",
                    category: "Prompt",
                    slash: { name: "snippets:reload" },
                    onSelect() {
                        void executeReloadInPrompt(ref)
                    },
                },
                {
                    title: "Insert snippet",
                    value: "snippets.insert",
                    description: "Insert a snippet trigger into the prompt",
                    category: "Prompt",
                    onSelect() {
                        syncPromptInput(ref, insertSnippetTrigger(ref.current.input))
                        ref.focus()
                    },
                },
                {
                    title: "Accept snippet autocomplete",
                    value: "snippets.accept",
                    keybind: "input_submit",
                    category: "Prompt",
                    hidden: true,
                    enabled: ref.focused,
                    onSelect() {
                        if (accept()) return
                        ref.submit()
                    },
                },
            ])
        }, 0)
    })

    useKeyboard((event) => {
        const ref = props.ctx.prompt()
        const name = event.name?.toLowerCase()

        if (ref && isReloadCommand(ref.current.input) && (name === "return" || name === "enter")) {
            void executeReloadInPrompt(ref)
            event.preventDefault()
            event.stopPropagation()
            return
        }

        if (dialogBlockingInput()) return
        if (!visible()) return

        const total = options().length
        const actionable = total > 0 || canCreate()

        if ((name === "up" || name === "down") && actionable) {
            lockKeyboardSelection()
            setSelected((current) => stepSelection(current, total || 1, name === "up" ? -1 : 1))
            event.preventDefault()
            event.stopPropagation()
            return
        }

        if (name === "escape") {
            setDismissed(match()?.token)
            event.preventDefault()
            event.stopPropagation()
            return
        }

        if (name === "tab" && actionable) {
            if (total > 0) choose()
            else void createSnippetDraft()
            event.preventDefault()
            event.stopPropagation()
            return
        }

        schedulePromptSync()
    })

    return (
        <Show when={visible()}>
            <box position="absolute" top={-menuHeight()} left={0} right={0} zIndex={100} borderColor={props.ctx.api.theme.current.border} {...INLINE_BORDER}>
                <scrollbox ref={(ref: ScrollBoxRenderable) => (scroll = ref)} backgroundColor={props.ctx.api.theme.current.backgroundMenu} height={menuHeight()} scrollbarOptions={{ visible: false }}>
                    <For each={options()} fallback={<FallbackRow ctx={props.ctx} canCreate={canCreate()} creating={creating()} label={fallbackLabel()} draftName={draftName()} onCreate={() => void createSnippetDraft()} />}>
                        {(item, index) => (
                            <OptionRow
                                ctx={props.ctx}
                                item={item}
                                query={query()}
                                selected={index() === selected()}
                                selectedFg={selectedFg()}
                                onMouseMove={(x, y) => {
                                    if (!allowMouseHover()) return
                                    if (!recordMouseMove(x, y)) return
                                    setInputMode("mouse")
                                }}
                                onMouseOver={() => {
                                    if (inputMode() === "mouse") setSelected(index())
                                }}
                                onMouseDown={() => {
                                    setInputMode("mouse")
                                    setLastMousePos(undefined)
                                    setSelected(index())
                                }}
                                onMouseUp={() => choose(index())}
                            />
                        )}
                    </For>
                </scrollbox>
            </box>
        </Show>
    )

    function optionsForQuery(value: string): AutocompleteItem[] {
        const snippetOptions: AutocompleteItem[] = filterSnippets(snippets(), value).map((snippet) => ({
            kind: "snippet",
            id: `snippet:${snippet.name}`,
            label: `#${snippet.name}`,
            description: describeSnippet(snippet),
            aliases: matchedAliases(snippet, value),
            snippet,
        }))
        const skillOptions: AutocompleteItem[] = filterSkills(skills(), value).map((skill) => ({
            kind: "skill",
            id: `skill:${skill.name}`,
            label: `#skill(${skill.name})`,
            description: describeSkill(skill),
            aliases: [],
            skill,
        }))
        return [...snippetOptions, ...skillOptions]
    }

    function canCreateForQuery(value: string) {
        if (loading()) return false
        const name = normalizeSnippetName(value)
        return name.length > 0 && optionsForQuery(value).length === 0
    }

    function fallbackLabel() {
        if (loading()) return "Loading snippets and skills..."
        if (snippets().length === 0 && skills().length === 0) return "No snippets or skills found"
        return "No matching snippets or skills"
    }

    function lockKeyboardSelection() {
        setInputMode("keyboard")
        setIgnoreMouseUntil(Date.now() + MOUSE_HOVER_SUPPRESS_MS)
    }

    function allowMouseHover() {
        return Date.now() >= ignoreMouseUntil()
    }

    function recordMouseMove(x: number, y: number) {
        const last = lastMousePos()
        if (last?.x === x && last.y === y) return false
        setLastMousePos({ x, y })
        return true
    }

    function beginDialogHandoff() {
        const until = Date.now() + MOUSE_HOVER_SUPPRESS_MS
        setDialogHandoffUntil(until)
        if (pendingDialogHandoff) clearTimeout(pendingDialogHandoff)
        pendingDialogHandoff = setTimeout(() => {
            if (dialogHandoffUntil() === until) setDialogHandoffUntil(0)
            props.ctx.requestRender()
        }, MOUSE_HOVER_SUPPRESS_MS + 25)
    }

    function restorePromptFocus(ref: TuiPromptRef) {
        if (pendingPromptFocus) clearTimeout(pendingPromptFocus)
        pendingPromptFocus = setTimeout(() => ref.focus(), 175)
    }

    function schedulePromptSync() {
        const ref = props.ctx.prompt()
        if (!ref || dialogBlockingInput()) return
        const previous = input()
        setSyncingPrompt(true)
        setMenuEpoch((current) => current + 1)
        if (pendingPromptSync) clearTimeout(pendingPromptSync)
        pendingPromptSync = setTimeout(() => {
            const next = ref.current.input ?? ""
            if (next !== previous) setInput(next)
            setSyncingPrompt(false)
            props.ctx.requestRender()
        }, 0)
    }

    async function executeReloadInPrompt(ref: TuiPromptRef) {
        const count = await reloadSnippetsInTui(props.ctx.api, refresh)
        syncPromptInput(ref, "")
        setDismissed(undefined)
        ref.focus()
        props.ctx.requestRender()
        setTimeout(() => {
            props.ctx.api.ui.toast({
                title: "Snippets reloaded",
                message: `Reloaded ${count} snippet${count === 1 ? "" : "s"}.`,
                duration: 3000,
            })
            props.ctx.requestRender()
        }, 0)
    }

    async function createSnippetDraft(rawQuery?: string) {
        const ref = props.ctx.prompt()
        const name = normalizeSnippetName(rawQuery ?? query())
        if (!ref || !name || creating()) return
        const current = findTrailingHashtagTrigger(ref.current.input)
        const nextInput = current ? `${ref.current.input.slice(0, current.start)}#${name}` : `#${name}`
        const dismissedToken = `#${name}`
        const editor = resolveExternalEditor()

        if (!editor) {
            props.ctx.api.ui.toast({ variant: "warning", message: "Set VISUAL or EDITOR to create snippets from the TUI." })
            return
        }

        props.ctx.api.ui.dialog.setSize("medium")
        setDialogOpen(true)
        props.ctx.api.ui.dialog.replace(() => (
            <props.ctx.api.ui.DialogConfirm
                title={`Create snippet #${name}?`}
                message={`This will create the snippet draft and open it in $${editor.env} (${editor.command}).`}
                onCancel={() => {
                    setDialogOpen(false)
                    beginDialogHandoff()
                    props.ctx.api.ui.dialog.clear()
                    restorePromptFocus(ref)
                }}
                onConfirm={() => {
                    setDialogOpen(false)
                    beginDialogHandoff()
                    props.ctx.api.ui.dialog.clear()
                    void (async () => {
                        setCreating(true)
                        try {
                            syncPromptInput(ref, nextInput)
                            const filePath = await ensureSnippetDraft(name, props.ctx.api.state.path.directory)
                            await addPendingDraft(props.ctx.api.state.path.directory, name)
                            setDismissed(dismissedToken)
                            setCreating(false)
                            await openExternalEditor(props.ctx.api, filePath, editor)
                        } catch (error) {
                            props.ctx.api.ui.toast({ variant: "error", message: `Failed to create snippet: ${error instanceof Error ? error.message : String(error)}` })
                            syncPromptInput(ref, nextInput)
                            setDismissed(undefined)
                        } finally {
                            setCreating(false)
                            restorePromptFocus(ref)
                        }
                    })()
                }}
            />
        ))
    }
}

function OptionRow(props: {
    ctx: PromptContext
    item: AutocompleteItem
    query: string
    selected: boolean
    selectedFg: RGBA
    onMouseMove: (x: number, y: number) => void
    onMouseOver: () => void
    onMouseDown: () => void
    onMouseUp: () => void
}) {
    const fg = () => (props.selected ? props.selectedFg : props.ctx.api.theme.current.text)
    const mutedFg = () => (props.selected ? props.selectedFg : props.ctx.api.theme.current.textMuted)

    return (
        <box
            id={props.item.id}
            flexDirection="row"
            backgroundColor={props.selected ? props.ctx.api.theme.current.primary : undefined}
            paddingLeft={1}
            paddingRight={1}
            onMouseMove={(event: { x: number; y: number }) => props.onMouseMove(event.x, event.y)}
            onMouseOver={props.onMouseOver}
            onMouseDown={props.onMouseDown}
            onMouseUp={props.onMouseUp}
        >
            <text fg={fg()} flexShrink={0} wrapMode="none">
                <Highlighted text={props.item.label} query={props.query} fg={fg()} />
            </text>
            <Show when={props.item.aliases.length > 0}>
                <text fg={mutedFg()} flexShrink={0} wrapMode="none">
                    <Highlighted text={`  ${props.item.aliases.length === 1 ? "alias" : "aliases"}: ${props.item.aliases.join(", ")}`} query={props.query} fg={mutedFg()} />
                </text>
            </Show>
            <Show when={props.item.description}>
                <text fg={mutedFg()} wrapMode="none">
                    <Highlighted text={`  ${props.item.description}`} query={props.query} fg={mutedFg()} />
                </text>
            </Show>
        </box>
    )
}

function FallbackRow(props: { ctx: PromptContext; canCreate: boolean; creating: boolean; label: string; draftName: string; onCreate: () => void }) {
    return (
        <Show
            when={props.canCreate}
            fallback={
                <box paddingLeft={1} paddingRight={1}>
                    <text fg={props.ctx.api.theme.current.textMuted}>{props.label}</text>
                </box>
            }
        >
            <box id="create-snippet" paddingLeft={1} paddingRight={1} backgroundColor={props.ctx.api.theme.current.primary} onMouseUp={props.onCreate}>
                <text fg={selectedText(props.ctx.api.theme.current)}>{props.creating ? "Creating snippet..." : `Add new Snippet: #${props.draftName}`}</text>
            </box>
        </Show>
    )
}

function Highlighted(props: { text: string; query: string; fg: RGBA }) {
    return <For each={highlightMatches(props.text, props.query)}>{(part) => (part.match ? <span style={{ fg: props.fg, underline: true }}>{part.text}</span> : part.text)}</For>
}

function syncPromptInput(prompt: TuiPromptRef, input: string) {
    prompt.set({ input, mode: prompt.current.mode, parts: [...prompt.current.parts] })
}

function selectedText(theme: PromptContext["api"]["theme"]["current"]) {
    if (theme.background.a !== 0) return theme.background
    const { r, g, b } = theme.primary
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b
    return luminance > 0.5 ? RGBA.fromInts(0, 0, 0) : RGBA.fromInts(255, 255, 255)
}

function normalizeSnippetName(input: string) {
    return input
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-")
        .replace(/-{2,}/g, "-")
        .replace(/^-+|-+$/g, "")
}

async function reloadSnippetsInTui(api: TuiPluginApi, refresh: () => Promise<void>) {
    await refresh()
    await markSnippetReloadRequested(api.state.path.directory)
    return loadSnippets(api.state.path.directory).then((items) => items.length)
}

type Editor = { command: string; env: "VISUAL" | "EDITOR" }

function resolveExternalEditor(): Editor | undefined {
    const visual = Bun.env.VISUAL?.trim()
    if (visual) return { command: visual, env: "VISUAL" }
    const editor = Bun.env.EDITOR?.trim()
    if (editor) return { command: editor, env: "EDITOR" }
    return undefined
}

function editorBinary(editor: Editor) {
    return editor.command.split(/\s+/)[0] ?? editor.command
}

function usesTerminalUi(editor: Editor) {
    return !/^(code|cursor|windsurf|subl|zed|open|idea|webstorm|phpstorm|pycharm|rubymine|goland|clion|rider|datagrip)$/i.test(editorBinary(editor))
}

async function openExternalEditor(api: TuiPluginApi, filePath: string, editor: Editor) {
    const args = editor.command.split(/\s+/).filter(Boolean)
    const command = args.shift()
    if (!command) return false

    if (usesTerminalUi(editor)) api.renderer.suspend()
    try {
        await new Promise<void>((resolve, reject) => {
            const child = spawn(command, [...args, filePath], { stdio: usesTerminalUi(editor) ? "inherit" : "ignore", detached: !usesTerminalUi(editor) })
            child.on("error", reject)
            child.on("exit", () => resolve())
            if (!usesTerminalUi(editor)) {
                child.unref()
                resolve()
            }
        })
        return true
    } finally {
        if (usesTerminalUi(editor)) {
            api.renderer.resume()
            api.renderer.console.clear()
            api.renderer.requestRender()
        }
    }
}
