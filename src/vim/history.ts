import type { EditorInput } from "./editor"

type Point = { position: number; cursor: number }
type Change = { before: Point; after: Point }
type Method = (...args: any[]) => any

export function createNativeHistory(input: EditorInput) {
  const buffer = input.editBuffer
  if (!buffer || !input.undo || !input.redo) return

  let position = 0
  let version = 0
  let pending: Point | undefined
  const changes: Change[] = []
  const restore: Array<() => void> = []

  function point(): Point {
    return { position, cursor: input.isDestroyed ? 0 : input.cursorOffset }
  }

  function begin() {
    if (!pending || pending.position === position) pending = point()
  }

  function end() {
    if (pending && position > pending.position) changes.push({ before: pending, after: point() })
    pending = undefined
  }

  function observe(target: object, name: string, kind: "edit" | "reset" | "undo" | "redo") {
    const methods = target as Record<string, Method>
    const original = methods[name]
    const wrapped: Method = function (...args) {
      if (kind === "undo" || kind === "redo") {
        end()
        const result = original.apply(target, args)
        if (result !== null) position += kind === "undo" ? -1 : 1
        return result
      }
      if (kind === "reset") {
        const result = original.apply(target, args)
        position = 0
        version++
        pending = undefined
        changes.length = 0
        return result
      }

      const before = input.plainText
      const ownGroup = !pending
      begin()
      const result = original.apply(target, args)
      // replaceText creates an undo entry even when its contents are unchanged.
      if (input.plainText !== before || name === "replaceText" || name === "replaceTextOwned") {
        for (let index = 0; index < changes.length; index++) {
          const change = changes[index]!
          if (change.after.position <= position) continue
          if (change.before.position < position) {
            change.after = { position, cursor: pending!.cursor }
            changes.length = index + 1
          } else changes.length = index
          break
        }
        position++
      }
      if (ownGroup) end()
      return result
    }
    methods[name] = wrapped
    restore.push(() => {
      if (methods[name] === wrapped) methods[name] = original
    })
  }

  for (const name of [
    "insertChar",
    "insertText",
    "deleteChar",
    "deleteCharBackward",
    "deleteRange",
    "deleteLine",
    "newLine",
    "replaceText",
    "replaceTextOwned",
  ])
    observe(buffer, name, "edit")
  for (const name of ["setText", "setTextOwned", "clear", "clearHistory"]) observe(buffer, name, "reset")
  observe(buffer, "undo", "undo")
  observe(buffer, "redo", "redo")
  if (input.editorView?.deleteSelectedText) observe(input.editorView, "deleteSelectedText", "edit")

  function move(direction: "undo" | "redo") {
    end()
    let change: Change | undefined
    if (direction === "undo") {
      for (let index = changes.length - 1; index >= 0; index--) {
        if (changes[index]!.before.position < position) {
          if (position <= changes[index]!.after.position) change = changes[index]
          break
        }
      }
    } else {
      for (const candidate of changes) {
        if (candidate.after.position > position) {
          if (position >= candidate.before.position) change = candidate
          break
        }
      }
    }
    const target = change ? (direction === "undo" ? change.before : change.after) : undefined
    const before = position
    do {
      if (direction === "undo") {
        if (!buffer!.canUndo()) break
        input.undo!()
      } else {
        if (!buffer!.canRedo()) break
        input.redo!()
      }
    } while (target && position !== target.position)
    if (position !== before && target) input.cursorOffset = target.cursor
    return position !== before
  }

  return {
    begin,
    end,
    version: () => version,
    undo: () => move("undo"),
    redo: () => move("redo"),
    cleanup() {
      end()
      for (const stop of restore) stop()
    },
  }
}

export type NativeHistory = NonNullable<ReturnType<typeof createNativeHistory>>
