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
- **Closed list.** Tailwind's default palette, radii, shadows (box, inset, drop and
  text), breakpoints and font families are reset, so only utilities for the tokens
  above exist (no `bg-blue-500`, `shadow-md`, `drop-shadow-lg`, `font-serif`…).
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

## Component conventions

- **Structure:** `src/<layer>/<Component>/{Component.tsx, Component.spec.tsx, index.ts}`,
  with the layers `atoms`, `molecules`, `organisms` and `templates`. Components are
  **named exports** re-exported by `src/index.ts`. `src/internal/` (for example `cx`)
  is never exported.
- **Props** extend the native element attributes (`ComponentPropsWithRef<'button'>`…).
  `ref` is a plain prop (React 19, no `forwardRef`). `className` is accepted and
  appended **last**.
- **Variants** are closed maps of **complete class strings**. Never build a class by
  interpolation: Tailwind only generates classes it can read literally in the source.
- **No interface text inside the library** (D17): labels, `aria-label` and messages
  come from props.
- **Only token classes** (see the table above) plus structural Tailwind utilities
  (spacing, flex/grid, display, size, `animate-*`). Default text sizes are provisional.
- **Tests:** Vitest + Testing Library + jest-dom, and `expect(await axe(container))
.toHaveNoViolations()` (jest-axe) for every relevant variant. jsdom does not
  compute layout, so colour contrast is checked in `src/styles/tokens.spec.ts`.
  The `jest-axe` types are declared locally (`src/internal/jest-axe.d.ts`) because
  `@types/jest-axe` drags `@types/jest`, which conflicts with `vitest/globals`.

### Atoms

`Button` (`variant`, `size`, `loading` + `loadingLabel`), `Badge` (`tone`), `Container`
(`as`: `div` | `main` | `section`), `Spinner` (`label`), `Label` (`required`),
`FieldError` (`id`, `announce`), `Icon` (the icon component comes in the `icon`
prop, so the library never imports an icon catalog) and `TextInput` (`type` among
`text | email | password | search | tel | url | number`, `invalid`).

### Molecules

- **`FormField`** composes `Label`, the control, an optional `hint` and an optional
  `error`. It generates the ids with `useId` and hands them to the control through a
  **render prop** (`children: (control) => ReactNode`; spread `control` on any control:
  `id`, `aria-describedby`, `aria-invalid`, `required`). There is no `cloneElement` and
  the child does not have to be a `TextInput`.
- **`Dialog`** (Headless UI): `open`, `onClose`, `title` (its accessible name),
  optional `description`, **required `closeLabel`** (name of the close button),
  `children` and optional `actions`. Focus is trapped; `Esc` and a click on the
  backdrop close it.
- **`Tabs`** (Headless UI): declarative `tabs: { id, label, content }[]`, **required
  `label`** (name of the tab list), `defaultIndex`, or `selectedIndex` + `onChange`.
  Arrow keys, `Home` and `End` move and select the tab.
- **`EmptyState`**: `icon` (decorative), `title`, optional `description` and `action`,
  `headingLevel` (`h2` | `h3` | `h4`).
- **`Alert`**: `tone` (`info` | `success` | `danger`), optional `title`, `children`.
  `danger` is `role="alert"`; the others are `role="status"`.

### Organisms and templates

Generic layouts only: the library holds **no navigation data, no route, no persona and
no interface text**. `apps/web` (Phase 7) assembles each area with its own data.

- **`AppHeader`**: `<header>` (`banner`) with `brand`, an actions slot (`children`) and
  an optional menu button (`onMenuClick` requires `menuLabel`, by type; `menuExpanded`
  and `menuControls` are optional). The menu button only exists below `lg`.
- **`SideNav`**: `<nav>` with a **required `label`** (name of the landmark) and a list of
  `NavItem` (`{ id, label, href, icon?, current? }`). The `current` item gets
  `aria-current="page"`. `renderLink` plugs a router link (`{ href, className,
'aria-current'?, children }`); the default is a plain `<a>`, and the library never
  imports `next/*`.
- **`AppShell`**: skip link (**required `skipLinkLabel`**), header, optional sidebar and
  `<main>`. With a `sidebar`, `menuLabel` and `closeLabel` are required and `header` is a
  **render prop** that receives the menu props to spread on `AppHeader` (no
  `cloneElement`). The sidebar is fixed from `lg`; below it, it becomes a **drawer**
  (Headless UI dialog: focus trap, `Esc`, backdrop). The fixed sidebar is only in the DOM
  while the drawer is closed, so there is never more than one `navigation` landmark and
  no viewport logic in JS.
- **`FormPageLayout`**: `title` (`headingLevel`, `h1` by default), optional `description`
  and `actions`, children (the form) in a narrow centred column built on `Container`.

## Architecture guards

`libs/ui` is isolated from the API, auth, data fetching, server-only code and
domain types (ADR 003, ADR 010 D12). The rules live in one module,
`architecture/rules.mjs`, used by both the ESLint config and the tests:

- **ESLint** (`no-restricted-imports`, on `src/**/*.{ts,tsx}`): no `@mockp/*` but
  `@mockp/ui`, `@tanstack/*`, `next`, `next-auth`, `@auth/*`, `@apollo/*`,
  `graphql`, `@mui/*`, `@emotion/*`, `@prisma/*`, `@nestjs/*`, `ioredis`,
  `bullmq`, `pg`, any `/apps/` path, and no relative import that leaves the
  library (checked per directory depth, up to 8 levels under `src`).
- **Utilities the closed theme does not generate** are rejected in non-spec `.ts`/`.tsx`
  files (they would fail silently, with no style at all): the default palette
  (`bg-blue-500`, `text-gray-700`…), `black`/`white` as colours, default `shadow-*`,
  `inset-shadow-*`, `drop-shadow-*`, `text-shadow-*` and default `rounded-*` steps.
- **Tests** (`architecture/architecture.spec.mjs`, part of `yarn validate`): the same
  rules with positive and negative fixtures, including dynamic `import()` and
  `require()` (which `no-restricted-imports` cannot see); a scan of `src` for
  forbidden imports and hard-coded colors (hex, `rgb()`, `hsl()`, `oklch()`,
  Tailwind arbitrary colors — allowed only in `tokens.css` and specs); a check of
  `package.json` dependencies; and a scan proving that no token definition
  (`@theme`, `--color-*`, `--scale-*`…) or `tailwind.config.*` exists in
  `libs/config`, `libs/api-client`, `libs/queue` or `apps/*/src`.
