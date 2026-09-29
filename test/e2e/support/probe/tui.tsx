import { Plugin } from "@opencode/plugin/tui"
import { InputRenderable, rgbToHex } from "@opentui/core"

// Runs inside real OpenCode. This is a driver/inspector, not a host substitute:
// all focus, modes, dialogs, routes, commands and plugin disposal belong to it.
export default Plugin.define({
  id: "zz-vim-e2e-probe",
  setup(context) {
    let remembered: typeof context.renderer.currentFocusedEditor
    let result: string | undefined
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(request) {
        const action = new URL(request.url).pathname
        const body = request.method === "POST" ? await request.json() : undefined
        if (action === "/remember") remembered = context.renderer.currentFocusedEditor
        else if (action === "/dispatch") context.keymap.dispatch(body.command)
        else if (action === "/route") context.ui.router.navigate(body)
        else if (action === "/dismiss") context.ui.dialog.clear()
        else if (action === "/select") {
          result = undefined
          const options = []
          for (let i = 1; i <= 40; i++)
            options.push({ title: `Choice ${String(i).padStart(2, "0")}`, value: String(i) })
          void context.ui.dialog.select({ title: "E2E choices", options }).then((value) => {
            result = value
          })
        } else if (action === "/native") {
          context.ui.dialog.show(() => (
            <box>
              <text>Native extension input</text>
              <input id="e2e-native" value="native" focused />
            </box>
          ))
        }
        // Observe after Solid/focus callbacks and clipboard continuations.
        await new Promise<void>((resolve) => setImmediate(resolve))
        const editor = context.renderer.currentFocusedEditor
        function inspect(input: typeof editor) {
          if (!input) return null
          if (input.isDestroyed) return { destroyed: true }
          return {
            destroyed: false,
            text: input instanceof InputRenderable ? input.value : input.plainText,
            cursor: input.cursorOffset,
            selected: input.hasSelection(),
            id: input.id,
          }
        }
        return Response.json({
          editor: inspect(editor),
          remembered: inspect(remembered),
          result,
          mode: context.keymap.mode.current(),
          route: context.ui.router.current(),
          listeners: context.renderer.keyInput.listenerCount("keypress"),
          colors: {
            foreground: rgbToHex(context.theme.background.base),
            background: rgbToHex(context.theme.text.feedback.info.base),
          },
        })
      },
    })
    void Bun.write(process.env.VIM_E2E_PROBE!, server.url.origin)
    return () => server.stop(true)
  },
})
