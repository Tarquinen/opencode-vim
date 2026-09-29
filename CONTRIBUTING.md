# Contributing

Bug reports, fixes, and improvements are welcome.

## Reporting bugs

Include the OpenCode and plugin versions, your operating system and terminal,
and steps to reproduce the problem. Mention the Vim mode, relevant custom
keybindings, and whether you use a terminal multiplexer such as tmux. Describe
what you expected and what happened instead.

For larger changes, open an issue first so we can agree on the approach.

## Development setup

Fork and clone the repository, then create a branch based on `dev`.
Use Node.js 22 (the CI version), npm, and a current version of Bun.

```sh
npm ci
```

The test helpers support Linux and macOS on x64 and ARM64. E2E tests also require
tmux. Downloads use `tar`, plus `unzip` on macOS.

## Running tests

```sh
bun run typecheck
bun run test
bun run test:e2e
```

- `test` covers our editing, clipboard and reader components, and comparisons
  against a pinned Neovim version downloaded automatically.
- `test:e2e` builds and packs the current plugin, then runs real terminal
  interactions against the latest stable OpenCode 2 release. Each scenario gets
  isolated configuration and a fresh session, with imported fixture transcripts
  for message-reader and transcript history tests. Live response and prompt
  history scenarios use a local controlled model stream, without paid inference.
  Source and packed-package runtime loading, reactivity and cleanup are tested
  inside real OpenCode too.
  Captures, logs, and results are saved under `test-results/e2e/`.

Run individual scenarios with `bun run test:e2e message-reader`.

Internet access is needed for initial binary downloads and for E2E tests to
resolve the latest OpenCode release. Downloaded binaries are cached under
`node_modules/.cache/`.

Use `bun run build` to build the plugin into `dist/`.

## Adding tests

Put unit tests in `test/unit/`, integration tests in `test/integration/`, and
shared fixtures and setup in `test/helpers/`.

Add focused regression coverage for bug fixes. Use E2E scenarios when the behavior
depends on real OpenCode keyboard handling, focus, dialogs, or tabs.

Test plugin-owned behavior directly with OpenTUI: editing and clipboard tests use
`test/helpers/fixture.ts`; reader component tests use `test/helpers/reader.tsx`.
These fixtures mount our components, not the plugin entrypoint. They may control
external boundaries such as desktop clipboard access and record outgoing calls.
Do not mount the plugin in a fake OpenCode context or imitate host mode changes,
transcript trees, scrolling, history, dialogs, or command implementations. Test
those integrations through real OpenCode E2E scenarios. See `test/README.md` for
the coverage map.

E2E scenarios live in `test/e2e/scenarios/` and are registered in
`test/e2e/run.ts`. Reuse the shared fixture and terminal helpers, and wait for
expected screen content rather than using fixed delays.

## Pull requests

- Target `dev`.
- Follow the surrounding code style and favor straightforward, readable code.
- Keep PRs focused and descriptions short, clear, and to the point. Explain what
  changed, why, and how you tested it. Respect reviewers' time: avoid walls of
  text, repetitive summaries, and unnecessary detail. Link related issues.
- If you use AI, understand, review, and test the changes before submitting.
  You are responsible for everything in your PR.

## License

Contributions are licensed under the project's [MIT License](LICENSE).
