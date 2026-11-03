# ui

Design system of the Mockp platform (`@mockp/ui`): Atomic Design components
(`atoms`, `molecules`, `organisms`, `templates`) built with React, Tailwind CSS,
Headless UI and Tabler Icons, documented in Storybook.

- **Design tokens belong to this library.** They are never defined in
  `libs/config` nor in `apps/web`; consumers only import what `libs/ui` exports.
- **Consumed as source.** `exports` points at `src` (TS/TSX), with no `dist`;
  the consumer's bundler (Vite, Storybook, Next) compiles it. The library is
  ESM (`"type": "module"`) and only runs under a bundler: relative imports
  carry no file extension, so it does not load in plain Node.
- Isolated from the API, Auth.js, TanStack Query, server-only configuration,
  `next/*` and domain types.

Decisions: [ADR 010](../../docs/adr/010-ui-foundation.md). This workspace is
only the scaffold; components, tokens and Storybook arrive in later subtasks.
