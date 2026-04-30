/** @jsxImportSource @opentui/solid */
import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from "@opencode-ai/plugin/tui"
import { PromptRoot } from "./prompt/root"
import type { PromptModule } from "./prompt/types"
import { createVimModule } from "./modules/vim"
import { createSnippetsModule } from "./modules/snippets"
import { checkAutoUpdate } from "./update"

const tui: TuiPlugin = async (api, options, meta) => {
    if (readAutoUpdate(options)) {
        let timer: Timer | undefined
        api.lifecycle.onDispose(() => {
            if (timer) clearTimeout(timer)
        })

        void checkAutoUpdate(meta, api.lifecycle.signal).then((result) => {
            if (!result.updated) return

            timer = setTimeout(() => {
                api.ui.toast({ variant: "info", message: "Updating opencode-vim. Restart OpenCode to finish." })
            }, 5000)
        }).catch(() => {})
    }

    const moduleCache = new Map<string, PromptModule[]>()
    const createModules = (key: string) => {
        const cached = moduleCache.get(key)
        if (cached) return cached

        const modules: PromptModule[] = []
        if (hasSnippetsPlugin(api)) modules.push(createSnippetsModule())
        modules.push(createVimModule(options))
        moduleCache.set(key, modules)
        return modules
    }

    api.slots.register({
        order: 50,
        slots: {
            home_prompt(ctx, props) {
                return <PromptRoot api={api} slot={ctx} kind="home" workspaceID={props.workspace_id} ref={props.ref} modules={createModules(`home:${props.workspace_id ?? ""}`)} />
            },
            session_prompt(ctx, props) {
                return (
                    <PromptRoot
                        api={api}
                        slot={ctx}
                        kind="session"
                        sessionID={props.session_id}
                        visible={props.visible}
                        disabled={props.disabled}
                        onSubmit={props.on_submit}
                        ref={props.ref}
                        modules={createModules(`session:${props.session_id}`)}
                    />
                )
            },
        },
    })
}

function readAutoUpdate(options: unknown) {
    if (!options || typeof options !== "object") return true
    const value = (options as { autoUpdate?: unknown }).autoUpdate
    return typeof value === "boolean" ? value : true
}

function hasSnippetsPlugin(api: TuiPluginApi) {
    return configHasSnippets(api.state.config.plugin) || configHasSnippets(api.tuiConfig.plugin) || api.plugins.list().some(pluginHasSnippets)
}

function configHasSnippets(plugins: unknown) {
    if (!Array.isArray(plugins)) return false
    return plugins.some((plugin) => specHasSnippets(Array.isArray(plugin) ? plugin[0] : plugin))
}

function pluginHasSnippets(plugin: ReturnType<TuiPluginApi["plugins"]["list"]>[number]) {
    return plugin.enabled && (specHasSnippets(plugin.id) || specHasSnippets(plugin.spec))
}

function specHasSnippets(spec: unknown) {
    if (typeof spec !== "string") return false
    return spec === "opencode-snippets" || spec.startsWith("opencode-snippets@") || spec.includes("/opencode-snippets")
}

const plugin: TuiPluginModule & { id: string } = {
    id: "local.opencode-vim",
    tui,
}

export default plugin
