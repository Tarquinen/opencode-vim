# opencode-vim

Vim-style editing for the OpenCode 2 prompt.

This branch supports normal, insert, visual, and visual-line editing, custom
keymaps, prompt history, command dispatch, cursor styles, and `/vim` toggling.
The mode indicator appears before the working directory in the prompt footer.

Configure the local plugin in OpenCode 2's `cli.json`:

```json
{
  "plugins": [
    "opencode-vim@file:/home/dan/src/opencode-config/plugin/opencode-vim"
  ]
}
```

Options use the V2 object form:

```json
{
  "package": "opencode-vim@file:/home/dan/src/opencode-config/plugin/opencode-vim",
  "options": {
    "vim": {
      "defaultMode": "insert",
      "keymapTimeout": 500,
      "keymaps": {
        "insert": { "kj": "normal" },
        "normal": { "Y": "y$" }
      }
    }
  }
}
```

OpenCode 2 does not yet expose its prompt ref or low-level key interceptor to
plugins. This adapter uses the public renderer in the V2 plugin context to
bridge those capabilities to the existing Vim engine.
