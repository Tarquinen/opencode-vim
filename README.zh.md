# opencode-vim

为 OpenCode 输入框添加 Vim 风格的 insert 和 normal 模式编辑。

![Demo](./assets/demo2.gif)

## 安装

通过命令行安装：

```bash
opencode plugin opencode-vim@latest --global
```

## 快捷键

| 按键                                        | 说明                                     |
| ------------------------------------------- | ---------------------------------------- |
| `<Esc>`, `<C-[>`                            | 进入 normal 模式                         |
| `i`, `a`, `A`, `o`, `O`                     | 返回 insert 模式                         |
| `h`, `j`, `k`, `l`, `w`, `b`, `e`, `$`, `0` | 移动光标                                 |
| `x`, `d`, `c`, `y`, `p`, `u`, `<C-r>`       | 编辑、复制、粘贴、撤销、重做             |
| `v`, `V`                                    | 可视模式和可视行模式                     |
| `3w`, `diw`, `ci"`, `yiq`, `dip`, `yib`     | 计数和文本对象                           |
| normal 模式下 `<CR>`                        | 提交 prompt（默认，可通过 keymaps 配置） |
| `/vim`                                      | 开关 Vim 模式                            |

配置文档：[docs/configuration.zh.md](./docs/configuration.zh.md)
