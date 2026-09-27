# opencode-vim

Vim-style prompt editing and session navigation for OpenCode 2.

![Vim prompt editing, dialog navigation, and session mode](./assets/vim-in-motion-dialogs.gif)

## Installation

```sh
opencode plugin add opencode-vim@latest
```

## Updating

```sh
opencode plugin update opencode-vim@latest
```

Restart the terminal UI after updating to load the new version.

## Usage

Press `Esc` to enter normal mode and `i` to type again in insert mode.

In a session, press `s` from normal mode to browse messages and tools. Use `j`/`k`
to navigate, `Enter` to open an item, and `s` to return to the prompt.

Use `/vim` to toggle the plugin on or off.

## Documentation

- [Keybindings and modes](./docs/vim-behavior.md)
- [Configuration](./docs/configuration.md)
- [Custom keymaps](./docs/keymap-actions.md)
