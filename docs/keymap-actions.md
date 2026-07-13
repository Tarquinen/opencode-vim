# Keymap Actions

Each keymap entry maps a key sequence to an action in one Vim mode:

```jsonc
"keymaps": {
  "normal": {
    "q": "command:session.new"
  }
}
```

## Modes

| Mode | Keymaps apply while |
| --- | --- |
| `insert` | Typing text |
| `normal` | Navigating and editing |
| `visual` | Selecting characters |
| `visual-line` | Selecting lines |

All action types below can be configured in any mode.

## Actions

| Action | Behavior |
| --- | --- |
| `normal` | Enter normal mode |
| `insert` | Enter insert mode |
| `submit` | Submit the prompt |
| `command:<name>` | Dispatch an active OpenCode command |
| Any other string | Run it as a Vim key sequence, such as `y$` |

## OpenCode Commands

Command mappings use the command ID, not a slash command. For example, use `command:session.new`, not `command:/new`.

Commands are provided by OpenCode and installed plugins. They may change between versions and only run when their UI context is active. The commands below are available from a focused prompt in the current OpenCode release.

### Application

| Command | Behavior |
| --- | --- |
| `command.palette.show` | Open the command palette |
| `session.list` | Open the session list |
| `session.new` | Start a new session |
| `session.quick_switch.1` through `.9` | Switch to a numbered recent session |
| `workspace.copy_path` | Copy the current worktree path |
| `workspace.list` | Open workspace management |
| `model.list` | Open model selection |
| `model.cycle_recent` | Select the next recent model |
| `model.cycle_recent_reverse` | Select the previous recent model |
| `model.cycle_favorite` | Select the next favorite model |
| `model.cycle_favorite_reverse` | Select the previous favorite model |
| `agent.list` | Open agent selection |
| `agent.cycle` | Select the next agent |
| `agent.cycle.reverse` | Select the previous agent |
| `mcp.list` | Open MCP management |
| `variant.cycle` | Select the next model variant |
| `variant.list` | Open variant selection |
| `provider.connect` | Connect a provider |
| `console.org.switch` | Switch organizations |
| `opencode.status` | Open status information |
| `opencode.debug` | Open debug information |
| `theme.switch` | Select a theme |
| `theme.switch_mode` | Toggle light and dark mode |
| `theme.mode.lock` | Lock automatic theme changes |
| `help.show` | Open help |
| `docs.open` | Open OpenCode documentation |
| `app.exit` | Exit OpenCode |
| `app.debug` | Toggle the debug overlay |
| `app.console` | Toggle the renderer console |
| `app.heap_snapshot` | Write a heap snapshot |
| `terminal.suspend` | Suspend OpenCode |
| `terminal.title.toggle` | Toggle terminal title updates |
| `app.toggle.animations` | Toggle TUI animations |
| `app.toggle.file_context` | Toggle automatic file context |
| `app.toggle.diffwrap` | Toggle diff wrapping |
| `app.toggle.paste_summary` | Toggle pasted-text summaries |
| `app.toggle.session_directory_filter` | Toggle session directory filtering |
| `permission.mode` | Toggle permission auto-approval |

### Prompt

| Command | Behavior |
| --- | --- |
| `prompt.clear` | Clear the prompt |
| `prompt.submit` | Submit the prompt |
| `prompt.editor_context.clear` | Remove attached editor context |
| `prompt.paste` | Paste clipboard text or an image |
| `session.interrupt` | Interrupt the active session |
| `prompt.editor` | Edit the prompt in an external editor |
| `prompt.skills` | Open skill selection |
| `workspace.set` | Switch workspace |
| `session.move` | Move the session to another project |
| `prompt.stash` | Stash and clear the prompt |
| `prompt.stash.pop` | Restore the latest prompt stash |
| `prompt.stash.list` | Open prompt stash selection |
| `prompt.history.previous` | Load the previous prompt |
| `prompt.history.next` | Load the next prompt |

### Autocomplete

These commands are active while prompt autocomplete is visible.

| Command | Behavior |
| --- | --- |
| `prompt.autocomplete.prev` | Select the previous item |
| `prompt.autocomplete.next` | Select the next item |
| `prompt.autocomplete.hide` | Hide autocomplete |
| `prompt.autocomplete.select` | Accept the selected item |
| `prompt.autocomplete.complete` | Complete or expand the selected item |

### Input

These commands act on the focused prompt input.

| Command | Behavior |
| --- | --- |
| `input.move.left` | Move left |
| `input.move.right` | Move right |
| `input.move.up` | Move up |
| `input.move.down` | Move down |
| `input.select.left` | Select left |
| `input.select.right` | Select right |
| `input.select.up` | Select up |
| `input.select.down` | Select down |
| `input.line.home` | Move to logical line start |
| `input.line.end` | Move to logical line end |
| `input.select.line.home` | Select to logical line start |
| `input.select.line.end` | Select to logical line end |
| `input.visual.line.home` | Move to visual line start |
| `input.visual.line.end` | Move to visual line end |
| `input.select.visual.line.home` | Select to visual line start |
| `input.select.visual.line.end` | Select to visual line end |
| `input.buffer.home` | Move to the start of the prompt |
| `input.buffer.end` | Move to the end of the prompt |
| `input.select.buffer.home` | Select to the start of the prompt |
| `input.select.buffer.end` | Select to the end of the prompt |
| `input.delete.line` | Delete the current line |
| `input.delete.to.line.end` | Delete to line end |
| `input.delete.to.line.start` | Delete to line start |
| `input.backspace` | Delete backward |
| `input.delete` | Delete forward |
| `input.newline` | Insert a newline |
| `input.undo` | Undo an edit |
| `input.redo` | Redo an edit |
| `input.word.forward` | Move forward one word |
| `input.word.backward` | Move backward one word |
| `input.select.word.forward` | Select forward one word |
| `input.select.word.backward` | Select backward one word |
| `input.delete.word.forward` | Delete forward one word |
| `input.delete.word.backward` | Delete backward one word |
| `input.select.all` | Select the entire prompt |
| `input.submit` | Submit the prompt input |

### Session

These commands are active in a session.

| Command | Behavior |
| --- | --- |
| `session.share` | Share the session or copy its URL |
| `session.rename` | Rename the session |
| `session.timeline` | Open the message timeline |
| `session.fork` | Fork from the timeline |
| `session.compact` | Summarize the session |
| `session.unshare` | Stop sharing the session |
| `session.undo` | Undo the latest user message |
| `session.redo` | Redo an undone message |
| `session.sidebar.toggle` | Toggle the session sidebar |
| `session.toggle.conceal` | Toggle code concealment |
| `session.toggle.timestamps` | Toggle message timestamps |
| `session.toggle.thinking` | Toggle expanded thinking |
| `session.toggle.actions` | Toggle tool action details |
| `session.toggle.scrollbar` | Toggle the session scrollbar |
| `session.toggle.generic_tool_output` | Toggle generic tool output |
| `session.page.up` | Scroll up half a page |
| `session.page.down` | Scroll down half a page |
| `session.line.up` | Scroll up one line |
| `session.line.down` | Scroll down one line |
| `session.half.page.up` | Scroll up a quarter page |
| `session.half.page.down` | Scroll down a quarter page |
| `session.first` | Jump to the first message |
| `session.last` | Jump to the last message |
| `session.messages_last_user` | Jump to the latest user message |
| `session.message.next` | Jump to the next message |
| `session.message.previous` | Jump to the previous message |
| `messages.copy` | Copy the latest assistant message |
| `session.copy` | Copy the session transcript |
| `session.export` | Export the session transcript |
| `session.background` | Background active subagents |
| `session.child.first` | Open the first child session |
| `session.parent` | Open the parent session |
| `session.child.next` | Open the next child session |
| `session.child.previous` | Open the previous child session |

### Plugins

| Command | Behavior | Requirement |
| --- | --- | --- |
| `opencode-vim.toggle` | Toggle Vim mode | Always available |
| `snippets.reload` | Reload snippets | Snippets plugin installed |
| `snippets.insert` | Open snippet selection | Snippets plugin installed |
| `snippets.accept` | Accept the active snippet field | Snippets plugin installed |
| `plugins.list` | Open plugin management | Built-in plugin manager enabled |
| `plugins.install` | Open plugin installation | Built-in plugin manager enabled |
| `diff.open` | Open the diff viewer | Built-in diff viewer enabled |
| `tips.toggle` | Toggle home-screen tips | Home screen visible |

Other plugins can register additional commands. A command that is unavailable in the current context is ignored.
