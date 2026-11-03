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

Decisions: [ADR 010](../../docs/adr/010-ui-foundation.md). Components and
Storybook arrive in later subtasks.

## Design tokens

Tokens are CSS, in the Tailwind `@theme` of `src/styles/tokens.css`. **Only the
semantic names below are the contract with Figma** (Figma variables use the same
names): the value may change, the name does not. The values are **provisional**.

| Token                                                   | Tailwind utilities                             | Role                                                                          |
| ------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------- |
| `--color-primary`                                       | `bg-primary`, `text-primary`, `border-primary` | Brand / main action                                                           |
| `--color-primary-foreground`                            | `text-primary-foreground`                      | Text and icons on `primary`                                                   |
| `--color-surface`                                       | `bg-surface`                                   | Page background                                                               |
| `--color-surface-raised`                                | `bg-surface-raised`                            | Cards, dialogs, raised areas                                                  |
| `--color-content`                                       | `text-content`                                 | Main text                                                                     |
| `--color-content-muted`                                 | `text-content-muted`                           | Secondary text                                                                |
| `--color-border`                                        | `border-border`                                | Borders and dividers                                                          |
| `--color-danger`                                        | `bg-danger`, `text-danger`                     | Errors, destructive actions                                                   |
| `--color-success`                                       | `bg-success`, `text-success`                   | Success feedback                                                              |
| `--spacing`                                             | `p-4`, `m-2`, `gap-3`…                         | Spacing base (`0.25rem`)                                                      |
| `--radius-none`, `--radius-sm`, `--radius-md`           | `rounded-none`, `rounded-sm`, `rounded-md`     | Corner radius                                                                 |
| `--shadow-card`                                         | `shadow-card`                                  | Card elevation                                                                |
| `--breakpoint-sm`, `--breakpoint-md`, `--breakpoint-lg` | `sm:`, `md:`, `lg:`                            | `40rem`, `48rem`, `64rem`                                                     |
| `--font-sans`                                           | `font-sans`                                    | Font stack (token and fallbacks only; loading the font is the consumer's job) |

- **The scales are internal.** `--scale-brand-*`, `--scale-neutral-*`,
  `--scale-green-*` and `--scale-red-*` live on `:root`, outside `@theme`: they
  generate no utilities and their names are **not** part of the contract.
- **Closed list.** Tailwind's default palette, radii, shadows, breakpoints and font
  families are reset (`--font-*: initial`), so only utilities for the tokens above
  exist (no `bg-blue-500`, `font-serif` or `font-mono`).
- **Text sizes are not part of the contract yet.** `text-sm`, `text-lg`… remain
  Tailwind's defaults and are provisional until Figma defines the typography.
- **Contrast.** The provisional values meet WCAG AA (≥ 4.5:1) for the text pairs
  checked in `src/styles/tokens.spec.ts`. `--color-success` is `hsl(142 64% 30%)`
  (provisional); the first proposal (32%) was adjusted because it did not reach
  4.5:1 on `surface`.

### Using the tokens

```css
/* Simplest: tokens, Tailwind and the library sources in one import. */
@import '@mockp/ui/styles.css';
```

`styles.css` carries `@import 'tailwindcss'` and an `@source` relative to its own
file. A consumer that imports only `@mockp/ui/tokens.css` must import Tailwind
itself and add its own `@source` for the library, because Tailwind does not scan
`node_modules`.

## Architecture guards

`libs/ui` is isolated from the API, auth, data fetching, server-only code and
domain types (ADR 003, ADR 010 D12). The rules live in one module,
`architecture/rules.mjs`, used by both the ESLint config and the tests:

- **ESLint** (`no-restricted-imports`, on `src/**/*.{ts,tsx}`): no `@mockp/*` but
  `@mockp/ui`, `@tanstack/*`, `next`, `next-auth`, `@auth/*`, `@apollo/*`,
  `graphql`, `@mui/*`, `@emotion/*`, `@prisma/*`, `@nestjs/*`, `ioredis`,
  `bullmq`, `pg`, any `/apps/` path, and no relative import that leaves the
  library (checked per directory depth, up to 8 levels under `src`).
- **Tests** (`architecture/architecture.spec.mjs`, part of `yarn validate`): the same
  rules with positive and negative fixtures, including dynamic `import()` and
  `require()` (which `no-restricted-imports` cannot see); a scan of `src` for
  forbidden imports and hard-coded colors (hex, `rgb()`, `hsl()`, `oklch()`,
  Tailwind arbitrary colors — allowed only in `tokens.css` and specs); a check of
  `package.json` dependencies; and a scan proving that no token definition
  (`@theme`, `--color-*`, `--scale-*`…) or `tailwind.config.*` exists in
  `libs/config`, `libs/api-client`, `libs/queue` or `apps/*/src`.
