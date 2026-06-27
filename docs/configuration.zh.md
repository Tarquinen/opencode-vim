# 配置指南

介绍如何在 OpenCode 中启用 `opencode-vim` 并配置 Vim 输入行为。

## 基本设置

在 `tui.jsonc` 的 `plugin` 数组中添加 `opencode-vim`：

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
                },
            },
        ],
    ],
}
```

如果插件安装在别处，请修改路径。

## 完整示例

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
                            "blinking": true,
                        },
                        "normal": {
                            "style": "block",
                            "blinking": true,
                        },
                    },
                    "debug": false,
                    "debugPath": "/home/you/.cache/opencode/opencode-vim.log",
                    "keymaps": {
                        "insert": {
                            "kj": "normal",
                        },
                        "normal": {
                            "<CR>": "submit",
                            "Y": "y$",
                        },
                    },
                },
            },
        ],
    ],
}
```

## 选项

### `autoUpdate`

当有新版本时自动更新 `opencode-vim`。

默认：

```jsonc
"autoUpdate": true
```

示例：

```jsonc
"autoUpdate": false
```

### `defaultMode`

输入框启动时的模式。

可选值：

- `"insert"`
- `"normal"`

默认：

```jsonc
"defaultMode": "insert"
```

示例：

```jsonc
"defaultMode": "normal"
```

### `keymapTimeout`

当按键映射只输入了部分时，等待下一个按键的时间，单位毫秒。

默认：

```jsonc
"keymapTimeout": 500
```

示例：

```jsonc
"keymapTimeout": 250
```

```jsonc
"keymapTimeout": 1000
```

短超时适合快速回退，长超时适合慢速输入多键映射。

### `pendingDisplayDelay`

在状态栏显示待按键序列的延迟，单位毫秒。

默认：

```jsonc
"pendingDisplayDelay": 120
```

示例：

```jsonc
"pendingDisplayDelay": 0
```

```jsonc
"pendingDisplayDelay": 300
```

只影响显示，不影响按键映射等待时间。

### `cursorStyles`

各模式下的光标样式。

可选样式：

- `"block"`
- `"line"`
- `"underline"`
- `"default"`

默认：

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

示例：

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

可以只配置某个模式，未设置的部分使用默认值。

### `debug`

启用调试日志。

默认：

```jsonc
"debug": false
```

示例：

```jsonc
"debug": true
```

也可以通过环境变量启用：

```bash
VIM_PROMPT_DEBUG=1
```

### `debugPath`

调试日志的写入路径。

默认：

```txt
~/.cache/opencode/opencode-vim.log
```

示例：

```jsonc
"debugPath": "/tmp/opencode-vim.log"
```

须使用绝对路径，不支持 `~`。

### `keymaps`

自定义 insert 模式和 normal 模式的按键映射。

可选模式：

- `"insert"`
- `"normal"`

每个映射项将一个按键序列映射到一个动作：

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

支持的内置动作：

| 动作           | 可用模式       | 效果                               |
| -------------- | -------------- | ---------------------------------- |
| `"submit"`     | insert, normal | 提交 prompt                        |
| `"normal"`     | 仅 insert      | 退出 insert 模式，进入 normal 模式 |
| `"insert"`     | 仅 normal      | 进入 insert 模式                   |
| `"<vim keys>"` | 仅 normal      | 执行对应的 Vim 按键序列            |

例如，将 `Y` 映射为从光标处拉到行尾：

```jsonc
"keymaps": {
  "normal": {
    "Y": "y$"
  }
}
```

与其他按键不同，`<CR>` 在 normal 模式下未配置映射时默认提交 prompt。insert 模式下如果 `<CR>` 未配置映射，且 OpenCode 的 `input_submit` 不为 `return`，则插入换行而非提交。

> **注意：** 当 `input_submit` 不为 `"return"` 时，还需在 OpenCode 的 `keybinds` 中设置 `"input_newline": "return"`。否则 `<CR>` 在 insert 模式下既不提交也不换行，相当于无效按键。

## 按键映射语法

按键序列可以使用可打印 ASCII 字符（不能包含空格，空格用 `<Space>` 表示）。

示例：

```jsonc
"x": "d"
"gg": "0"
"Y": "y$"
"\\r": "<C-r>"
```

支持的特殊键：

- `<Esc>`
- `<CR>`
- `<Tab>`
- `<BS>`
- `<Del>`
- `<Space>`
- `<C-a>` 到 `<C-z>`

Ctrl 键名称必须用小写，用 `<C-s>` 而不是 `<C-S>`。

不支持的示例：

```jsonc
"<C-S>": "submit"
"<C-1>": "submit"
"<Up>": "k"
"a b": "normal"
```

无效的映射会被跳过。如有需要，启用调试日志排查问题。

## 按键映射示例

使用 `kj` 或 `jk` 退出 insert 模式：

```jsonc
"keymaps": {
  "insert": {
    "kj": "normal",
    "jk": "normal"
  }
}
```

normal 模式下使用 `<CR>` 提交是默认行为，该映射可省略：

```jsonc
"keymaps": {
  "normal": {
    "<CR>": "submit"
  }
}
```

在 insert 模式下用 Ctrl-S 提交：

```jsonc
"keymaps": {
  "insert": {
    "<C-s>": "submit"
  }
}
```

`Y` 拉取到行尾：

```jsonc
"keymaps": {
  "normal": {
    "Y": "y$"
  }
}
```

`D` 删除到行首：

```jsonc
"keymaps": {
  "normal": {
    "D": "d0"
  }
}
```

`H` 移到行首，`L` 移到行尾：

```jsonc
"keymaps": {
  "normal": {
    "H": "0",
    "L": "$"
  }
}
```

用 `q` 从 normal 模式进入 insert 模式：

```jsonc
"keymaps": {
  "normal": {
    "q": "insert"
  }
}
```

使用类似 leader 键的序列：

```jsonc
"keymaps": {
  "normal": {
    "\\s": "submit",
    "\\r": "<C-r>"
  }
}
```

## 故障排查

如果映射不生效，请检查：

- 模式是 `insert` 或 `normal`
- 按键序列不包含空格
- 特殊键名称准确无误
- Ctrl 键使用小写字母，如 `<C-s>`
- 动作字符串不为空

如需调试配置问题，启用日志：

```jsonc
"debug": true,
"debugPath": "/tmp/opencode-vim.log"
```
