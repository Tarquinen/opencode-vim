# Configuration Guide

This guide shows how to enable `opencode-vim` in OpenCode and configure its Vim prompt behavior.

## Basic Setup

Add `opencode-vim` to the `plugin` array in your OpenCode `tui.jsonc` file:

```jsonc
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": [
    [
      "./plugin/opencode-vim",
      {
        "autoUpdate": true,
        "vim": {
          "defaultMode": "insert"
        }
      }
    ]
  ]
}
```

If your plugin is installed somewhere else, change the plugin path to match your setup.

## Full Example

```jsonc
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": [
    [
      "./plugin/opencode-vim",
      {
        "autoUpdate": true,
        "vim": {
          "defaultMode": "insert",
          "keymapTimeout": 500,
          "pendingDisplayDelay": 120,
          "cursorStyles": {
            "insert": {
              "style": "line",
              "blinking": true
            },
            "normal": {
              "style": "block",
              "blinking": true
            }
          },
          "debug": false,
          "debugPath": "/home/you/.cache/opencode/opencode-vim.log",
          "keymaps": {
            "insert": {
              "kj": "normal"
            },
            "normal": {
              "<CR>": "submit",
              "Y": "y$"
            }
          }
        }
      }
    ]
  ]
}
```

## Options

### `autoUpdate`

Checks the installed npm package version against the latest npm version on startup. If the installed version is older, `opencode-vim` removes its package directory from the OpenCode plugin cache so OpenCode reinstalls it on the next setup.

This only runs for npm-installed plugins. File and local development plugins are skipped.

Default:

```jsonc
"autoUpdate": true
```

Example:

```jsonc
"autoUpdate": false
```

### `defaultMode`

The mode the prompt starts in.

Allowed values:

- `"insert"`
- `"normal"`

Default:

```jsonc
"defaultMode": "insert"
```

Example:

```jsonc
"defaultMode": "normal"
```

### `keymapTimeout`

How long, in milliseconds, the prompt waits for the next key when a configured keymap has only been partially typed.

Default:

```jsonc
"keymapTimeout": 500
```

Examples:

```jsonc
"keymapTimeout": 250
```

```jsonc
"keymapTimeout": 1000
```

Use a shorter timeout for faster fallback after partial mappings. Use a longer timeout if you type multi-key mappings slowly.

### `pendingDisplayDelay`

How long, in milliseconds, the prompt waits before showing a pending key sequence in the status area.

Default:

```jsonc
"pendingDisplayDelay": 120
```

Examples:

```jsonc
"pendingDisplayDelay": 0
```

```jsonc
"pendingDisplayDelay": 300
```

This only affects display. It does not change how long keymaps wait for more input.

### `cursorStyles`

The cursor style to use in each mode.

Allowed styles:

- `"block"`
- `"line"`
- `"underline"`
- `"default"`

Default:

```jsonc
"cursorStyles": {
  "insert": {
    "style": "line",
    "blinking": true
  },
  "normal": {
    "style": "block",
    "blinking": true
  }
}
```

Examples:

```jsonc
"cursorStyles": {
  "insert": {
    "style": "line",
    "blinking": false
  },
  "normal": {
    "style": "block",
    "blinking": false
  }
}
```

```jsonc
"cursorStyles": {
  "insert": {
    "style": "underline"
  },
  "normal": {
    "style": "default"
  }
}
```

You can configure only one mode if you want. Any omitted values use the defaults.

### `debug`

Enables debug logging.

Default:

```jsonc
"debug": false
```

Example:

```jsonc
"debug": true
```

You can also enable debug logging with this environment variable:

```bash
VIM_PROMPT_DEBUG=1
```

### `debugPath`

The file path used for debug logs when debug logging is enabled.

Default:

```txt
~/.cache/opencode/opencode-vim.log
```

Example:

```jsonc
"debugPath": "/tmp/opencode-vim.log"
```

Use an absolute path in config. `~` is not expanded inside `debugPath`.

### `keymaps`

Custom keymaps for insert mode and normal mode.

Allowed modes:

- `"insert"`
- `"normal"`

Each keymap entry maps a key sequence to an action:

```jsonc
"keymaps": {
  "insert": {
    "kj": "normal"
  },
  "normal": {
    "<CR>": "submit"
  }
}
```

Supported built-in actions:

- `"normal"` exits insert mode and enters normal mode.
- `"insert"` enters insert mode.
- `"submit"` submits the OpenCode prompt.

Any other action string is treated as a Vim key sequence. For example, this maps `Y` to yank from the cursor to the end of the line:

```jsonc
"keymaps": {
  "normal": {
    "Y": "y$"
  }
}
```

## Keymap Syntax

Key sequences can contain printable ASCII characters, except literal spaces. Use `<Space>` for the space key.

Examples:

```jsonc
"x": "d"
"gg": "0"
"Y": "y$"
"\\r": "<C-r>"
```

Supported special keys:

- `<Esc>`
- `<CR>`
- `<Tab>`
- `<BS>`
- `<Del>`
- `<Space>`
- `<C-a>` through `<C-z>`

Ctrl key names must be lowercase. Use `<C-s>`, not `<C-S>`.

Unsupported examples:

```jsonc
"<C-S>": "submit"
"<C-1>": "submit"
"<Up>": "k"
"a b": "normal"
```

Invalid keymaps are skipped. Enable debug logging if you need to troubleshoot keymap registration.

## Keymap Examples

Use `kj` or `jk` to leave insert mode:

```jsonc
"keymaps": {
  "insert": {
    "kj": "normal",
    "jk": "normal"
  }
}
```

Submit the prompt with Enter in normal mode:

```jsonc
"keymaps": {
  "normal": {
    "<CR>": "submit"
  }
}
```

Submit the prompt with Ctrl-S in insert mode:

```jsonc
"keymaps": {
  "insert": {
    "<C-s>": "submit"
  }
}
```

Make `Y` yank to the end of the line:

```jsonc
"keymaps": {
  "normal": {
    "Y": "y$"
  }
}
```

Make `D` delete to the beginning of the line:

```jsonc
"keymaps": {
  "normal": {
    "D": "d0"
  }
}
```

Make `H` move to the beginning and `L` move to the end:

```jsonc
"keymaps": {
  "normal": {
    "H": "0",
    "L": "$"
  }
}
```

Use `q` to enter insert mode from normal mode:

```jsonc
"keymaps": {
  "normal": {
    "q": "insert"
  }
}
```

Use a leader-style sequence:

```jsonc
"keymaps": {
  "normal": {
    "\\s": "submit",
    "\\r": "<C-r>"
  }
}
```

## Troubleshooting

If a keymap does not work, check these first:

- The mode is either `insert` or `normal`.
- The key sequence does not contain a literal space.
- Special keys use one of the supported names exactly.
- Ctrl keys use lowercase letters, such as `<C-s>`.
- The action string is not empty.

To debug configuration problems, enable logging:

```jsonc
"debug": true,
"debugPath": "/tmp/opencode-vim.log"
```
