# ADR 010 — Fundação de UI: `libs/ui`, tokens, Tailwind e Storybook

## Status

Proposed

Esta ADR é aberta pela subtarefa 6.0 da Fase 6
([docs/IMPLEMENTATION_ROADMAP.md](../IMPLEMENTATION_ROADMAP.md)). Ela
**complementa** a [ADR 003](003-frontend-organization.md) — que decidiu
Atomic Design + feature-first, um único app Next.js, Tailwind CSS como
fundação visual, Headless UI, Tabler Icons e Storybook — e **não a
altera nem a supersede**. Passa a `Accepted` somente no fechamento da
Fase 6 (subtarefa 6.9). As ADRs 001–009 permanecem inalteradas. Os
resultados do spike 6.1 estão registrados na seção
[Resultados do spike 6.1](#resultados-do-spike-61).

## Contexto

- A Fase 6 estabelece `libs/ui` como design system isolado, **antes** de
  existir o `apps/web`.
- Os tokens de design (cor, tipografia, espaçamento, radius, sombras,
  breakpoints) são **propriedade de `libs/ui`**; `libs/config` não os
  contém e `apps/web` só os consome (`docs/TARGET_ARCHITECTURE.md`
  seções 5 e 9; ADR 003).
- `libs/ui` usa Atomic Design (`atoms`, `molecules`, `organisms`,
  `templates`), Tailwind CSS, Tabler Icons, Headless UI para primitives
  e Storybook; não acessa API, Auth.js, TanStack Query, configuração
  server-only nem tipos de domínio.
- Critério de aceite da Fase 6: a Fase 7 consome `libs/ui` sem exigir
  ajuste retroativo nela.

### Referência conceitual do repositório antigo

Conforme [docs/REFERENCE_REPOSITORY.md](../REFERENCE_REPOSITORY.md), o
inventário **somente de leitura** de `C:\dev\mockp\Mockp\libs\ui` serviu
de **referência conceitual**; **nenhum código foi copiado** e o
repositório antigo permanece inalterado. O que o inventário mostrou:

- atoms sem acoplamento (Button, Badge, Container, Dialog, Switch,
  Accordion, AutoComplete, campos de formulário);
- a API do `Button` (`variant`, `color`, `size`, `loading`,
  `fullWidth`);
- a casca com menu por props (Header, NavSidebar, Sidebar, Menus);
- a paleta HSL de matiz 210 (primária azul, cinzas tingidos, verde,
  vermelho, cantos retos, fonte Inter).

Lições a **não** repetir: templates que eram telas de domínio
(importando tipos GraphQL gerados, `next-auth`, `next/link`), `Header`
que lê sessão e papel, e quatro apps repetindo a casca.

## Decisão

Cada decisão carrega o estado atual: **aprovada**, **aprovada e
confirmada pelo spike 6.1**, **decidida pelo spike 6.1 e aprovada**,
**aprovada, a reavaliar com dado medido** ou **regra mantida**. A D2b e a
D6b nasceram do spike 6.1. Os números de versão citados são os
encontrados no spike; os **definitivos foram aprovados na 6.2** (seção
[Versões definitivas (6.2)](#versões-definitivas-62)).

| ID  | Pergunta                                 | Alternativas                                                                                          | Decisão aprovada                                                                                                                                                                                                                                                                         | Consequência                                                                                                                                                  | Estado                                                                                                                         |
| --- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| D1  | Branch da fase                           | partir da atual; do `main` após merge                                                                 | `feat/phase-6-ui` a partir da branch atual (`d3c91f8`)                                                                                                                                                                                                                                   | PR e merge ficam para depois                                                                                                                                  | Aprovada                                                                                                                       |
| D2  | Formato dos tokens                       | CSS como fonte única; objeto TS que gera o CSS                                                        | CSS como fonte única (`@theme` do Tailwind), consumida por Tailwind e Storybook                                                                                                                                                                                                          | Trocar valores é editar um arquivo; o objeto TS que geraria o CSS não foi testado no spike                                                                    | Aprovada; confirmada pelo spike 6.1                                                                                            |
| D2b | Nome da cor de texto semântica           | `--color-text` (`text-text`); `--color-content` (`text-content`)                                      | `--color-content` (utilitário `text-content`), não `--color-text`                                                                                                                                                                                                                        | Evita o utilitário `text-text`; refina o nome `text` citado na D3                                                                                             | Aprovada                                                                                                                       |
| D3  | Paleta e nomes                           | escalas numeradas; camada semântica (`primary`, `surface`, `text`, `danger`, `success`) sobre escalas | Camada semântica sobre escalas, com valores provisórios derivados da paleta do front antigo                                                                                                                                                                                              | Componentes usam só nomes semânticos; o Figma mapeia nome a nome                                                                                              | Aprovada                                                                                                                       |
| D4  | Contrato de nomes com o Figma            | só o README; README + página no Storybook                                                             | README da lib + página "Tokens" no Storybook                                                                                                                                                                                                                                             | O Figma usa variáveis com os mesmos nomes; o valor muda, o nome não                                                                                           | Aprovada                                                                                                                       |
| D5  | Versão e integração do Tailwind          | fixar agora; decidir após o spike                                                                     | Tailwind **4.3.3**, versão exata, com `@tailwindcss/vite` (e `@tailwindcss/postcss` para o Next na Fase 7)                                                                                                                                                                               | Funcionou com Vite 8, Node 24 e Next 16.4.2; os números definitivos estão em "Versões definitivas (6.2)" da ADR 010                                           | Decidida pelo spike 6.1; aprovada                                                                                              |
| D6  | Como `apps/web` consome `libs/ui`        | fonte TS/TSX; `dist` compilado                                                                        | `apps/web` consome `libs/ui` como **fonte TS/TSX** (`exports` apontando para `src`), sem `dist`; `transpilePackages` explícito na Fase 7, mesmo que o spike o tenha dispensado                                                                                                           | A Fase 7 configura `transpilePackages`; o Tailwind do consumidor precisa de `@source` ou do `styles.css` exportado pela lib                                   | Decidida pelo spike 6.1; aprovada                                                                                              |
| D6b | Formato de módulo de `libs/ui`           | ESM; CommonJS (como as libs de backend)                                                               | **ESM**: `"type": "module"`, `module: ESNext`, `moduleResolution: bundler`, `jsx: react-jsx`, `lib` com DOM                                                                                                                                                                              | Difere das libs de backend (CommonJS). A lib é consumida só por bundlers (Vite, Storybook, Next); imports relativos sem extensão não funcionam no Node nativo | Aprovada (nova; motivada pelo spike 6.1: CJS falha no Next com `createContext is not a function` e perde tree-shaking no Vite) |
| D7  | Storybook                                | `@storybook/react-vite`; framework Next                                                               | `storybook` e `@storybook/react-vite` **10.6.3**, executados por **`nx:run-commands`** com `cache: true` e `outputs` em `storybook-static`; **sem** `@nx/storybook` (+227 pacotes ao lockfile)                                                                                           | `libs/ui` não depende do Next; o build mediu ~3,2 s com 5 stories                                                                                             | Decidida pelo spike 6.1; aprovada                                                                                              |
| D8  | Teste de componentes                     | Vitest + jsdom + Testing Library; só interaction tests do Storybook                                   | Vitest + jsdom + Testing Library, mais o addon a11y do Storybook                                                                                                                                                                                                                         | Segue a stack já aprovada (`TARGET_ARCHITECTURE.md` seção 13)                                                                                                 | Aprovada                                                                                                                       |
| D9  | Conjunto mínimo de componentes           | (lista abaixo)                                                                                        | Conjunto abaixo                                                                                                                                                                                                                                                                          | Um conjunto maior seria especulação sem design                                                                                                                | Aprovada                                                                                                                       |
| D10 | Onde ficam os dados de menu das personas | `apps/web`; `libs/ui`; `libs/config`                                                                  | `apps/web` (Fase 7)                                                                                                                                                                                                                                                                      | `libs/ui` continua sem conhecer persona                                                                                                                       | Aprovada                                                                                                                       |
| D11 | Templates da Fase 6                      | só `AppShell`; `AppShell` + `FormPageLayout`; mais                                                    | `AppShell` + `FormPageLayout`                                                                                                                                                                                                                                                            | O `AppShell` precisa nascer na Fase 6 por causa do critério "sem ajuste retroativo"                                                                           | Aprovada                                                                                                                       |
| D12 | Como garantir o isolamento de `libs/ui`  | convenção; ESLint; ESLint + teste                                                                     | ESLint (`no-restricted-imports`) + teste permanente                                                                                                                                                                                                                                      | A regra falha o `yarn validate`, sem depender de revisão                                                                                                      | Aprovada                                                                                                                       |
| D13 | Storybook no `yarn validate`             | no `validate:nx` com cache; separado                                                                  | No `validate:nx`, com cache; build medido ~3,2 s com 5 stories; reavaliar com a duração medida na 6.7                                                                                                                                                                                    | Evita Storybook quebrar em silêncio, ao custo de tempo                                                                                                        | Aprovada; a reavaliar na 6.7                                                                                                   |
| D14 | Dockerfiles e o novo workspace           | acompanhar o grafo (a guarda exige); refatorar Dockerfiles para instalar só o necessário              | Acompanhar o grafo; registrar o aumento de instalação como risco com gatilho                                                                                                                                                                                                             | Refatorar os Dockerfiles seria mudança de infraestrutura, separada                                                                                            | Aprovada                                                                                                                       |
| D15 | Plugins de ESLint                        | adicionar `react-hooks` e `jsx-a11y`; não adicionar                                                   | `eslint-plugin-react-hooks` 7.1.1 e `eslint-plugin-jsx-a11y` 6.10.2, em flat config (`jsxA11y.flatConfigs.recommended` e `reactHooks.configs.flat['recommended-latest']`), mais `no-restricted-imports` para `@mockp/api-client`, `@mockp/config`, `@tanstack/*`, `next/*` e `next-auth` | Mais dependências, mas acessibilidade vira regra; compatíveis com ESLint 9.39                                                                                 | Aprovada; confirmada pelo spike 6.1                                                                                            |
| D16 | Regra de peers (TypeScript 6)            | igual ao D7 da Fase 5                                                                                 | Sem override, sem `--legacy-peer-deps`, sem troca de ferramenta, sem rebaixar o TypeScript; em qualquer incompatibilidade, parar e reportar                                                                                                                                              | Nenhuma exceção foi necessária no spike 6.1 (nenhum `YN0060`); a regra continua valendo                                                                       | Regra mantida                                                                                                                  |
| D17 | i18n                                     | biblioteca já; textos por props; adiar                                                                | Textos sempre por props, sem biblioteca (a ADR 003 não define i18n)                                                                                                                                                                                                                      | Evita travar a Fase 6 numa decisão que a ADR deixou fora                                                                                                      | Aprovada                                                                                                                       |
| D18 | Fontes                                   | carregar Inter em `libs/ui`; só o token com fallback                                                  | Só o token `font-sans` com pilha de fallback; o carregamento da fonte é do consumidor (`next/font` na Fase 7)                                                                                                                                                                            | `libs/ui` não carrega arquivos de fonte                                                                                                                       | Aprovada                                                                                                                       |
| D19 | Dark mode                                | agora; adiar                                                                                          | Adiar (os tokens semânticos deixam a porta aberta)                                                                                                                                                                                                                                       | Sem custo de design agora                                                                                                                                     | Aprovada                                                                                                                       |
| D20 | `tsconfig.json` da raiz                  | alterar; manter                                                                                       | Manter, salvo necessidade demonstrada                                                                                                                                                                                                                                                    | Já é um risco registrado com gatilho                                                                                                                          | Aprovada                                                                                                                       |
| D21 | Registro das decisões                    | ADR; só roadmap                                                                                       | ADR 010 `Proposed` na 6.0 e `Accepted` no fechamento                                                                                                                                                                                                                                     | Mais um documento, decisões duráveis rastreáveis                                                                                                              | Aprovada                                                                                                                       |
| D22 | Teste automático de acessibilidade       | só o addon a11y do Storybook; `jest-axe` nos testes de componente; só papéis da Testing Library       | `jest-axe` 11.0.0 (`toHaveNoViolations` nos testes de componente), com tipos declarados localmente porque `@types/jest-axe` arrasta `@types/jest` e conflita com `vitest/globals`; o contraste fica no `tokens.spec.ts`, porque o jsdom não calcula layout                               | Violações de papel, nome e rótulo falham o `yarn validate`; o contraste não é verificado pelo axe                                                             | Aprovada                                                                                                                       |

### Conjunto mínimo de componentes (D9)

- **Atoms:** `Button`, `Badge`, `Container`, `Spinner`, `TextInput`,
  `Label`, `FieldError`, `Icon` (wrapper do Tabler).
- **Molecules:** `FormField` (rótulo + campo + erro), `Dialog` (Headless
  UI), `Tabs`, `EmptyState`, `Alert`.
- **Organisms:** `AppHeader`, `SideNav`.
- **Templates:** `AppShell`, `FormPageLayout`.
- **Fora do conjunto:** `Toast` (exige estado global ou biblioteca),
  mapas, Stripe e qualquer componente de domínio.

### Divisão de templates

- `libs/ui` contém apenas templates **genéricos**: recebem marca, itens
  de menu e área do usuário por **props genéricas**, sem conhecer
  persona nem sessão, e sem requests ou autorização (ADR 003).
- A montagem de cada área (`/customer`, `/agent`, `/manager`, `/admin`)
  fica em `apps/web`, nos `layout.tsx` de cada rota, usando o
  `AppShell` com os dados de cada persona (Fase 7).

### Tokens

Os tokens são propriedade de `libs/ui` (nunca de `libs/config` nem de
`apps/web`). `apps/web` consome o CSS/tokens exportados por `libs/ui` e
nunca os redefine. Os componentes usam apenas nomes **semânticos**
(D3); o contrato de nomes com o Figma é o README da lib e a página
"Tokens" do Storybook (D4).

Os tokens vivem em CSS, no `@theme` do Tailwind (D2); a cor de texto
semântica se chama `--color-content` (D2b). O consumidor obtém as classes
da lib por `@source` no seu CSS ou importando um `styles.css` exportado
pela lib (com `@import "tailwindcss"` e `@source` relativo ao próprio
arquivo).

**Tokens da 6.3** (`libs/ui/src/styles/tokens.css`; `styles.css` e os
`exports` `./tokens.css` e `./styles.css`). Duas camadas:

- **Escalas internas** (`--scale-brand-*`, `--scale-neutral-*`,
  `--scale-green-*`, `--scale-red-*`): variáveis em `:root`, **fora do
  `@theme`**, portanto sem utilitários; seus nomes **não** são contrato
  com o Figma.
- **Camada semântica no `@theme`** (o contrato; o valor muda, o nome
  não): cores `--color-primary`, `--color-primary-foreground`,
  `--color-surface`, `--color-surface-raised`, `--color-content`,
  `--color-content-muted`, `--color-border`, `--color-danger` e
  `--color-success`, cada uma referenciando uma escala por `var()` (ou
  branco literal em `primary-foreground` e `surface-raised`); `--spacing`
  (base `0.25rem`); `--radius-none|sm|md`; `--shadow-card`;
  `--breakpoint-sm|md|lg` (`40rem`, `48rem`, `64rem`); e só `--font-sans`
  (D18). `--color-border` foi acrescentada na 6.3 ao conjunto citado na
  D3.
- **Lista fechada:** `--color-*`, `--radius-*`, `--shadow-*`,
  `--breakpoint-*`, `--font-*` (6.4), `--inset-shadow-*`, `--drop-shadow-*`
  e `--text-shadow-*` (6.5a) são zerados com `initial` antes da
  definição, então só existem utilitários dos tokens do contrato (sem
  `bg-blue-500`, `shadow-md`, `drop-shadow-lg`, `font-serif` nem
  `font-mono`). Os **tamanhos de
  texto** (`text-sm`, `text-lg`…) permanecem os padrões do Tailwind,
  provisórios e fora do contrato até o Figma definir a tipografia.

Valores provisórios (D3): `primary hsl(210 80% 42%)`, `primary-foreground`
branco, `surface hsl(210 20% 98%)`, `surface-raised` branco, `content
hsl(210 25% 12%)`, `content-muted hsl(210 12% 40%)`, `border hsl(210 16%
85%)`, `danger hsl(0 72% 45%)` e `success hsl(142 64% 30%)`. O valor
originalmente proposto para `success` (32%) foi ajustado para 30% por não
atingir 4,5:1 sobre `surface` (4,43:1; o valor final dá 4,92:1). Um teste
permanente (`tokens.spec.ts`) fixa o conjunto de nomes e o contraste AA
dos pares de texto.

### Guardas de arquitetura (6.4)

O isolamento de `libs/ui` (D4, D12) é regra automática, com **uma única
fonte** das listas, `libs/ui/architecture/rules.mjs` (módulo puro, fora
de `src/`, nunca parte da superfície do pacote), usada pela configuração
do ESLint e pelos testes:

- **ESLint** (`no-restricted-imports`, em `src/**/*.{ts,tsx}`): proíbe
  todo `@mockp/*` exceto `@mockp/ui`, `@tanstack/*`, `next` e `next/*`,
  `next-auth` e `next-auth/*`, `@auth/*`, `@apollo/*`, `graphql`,
  `@mui/*`, `@emotion/*`, `@prisma/*`, `@nestjs/*`, `ioredis`, `bullmq`,
  `pg`, qualquer caminho `/apps/` e imports relativos que saiam da lib
  (verificados por profundidade do arquivo, até 8 níveis sob `src`).
- **Testes permanentes** (`architecture.spec.mjs`, no `yarn validate`):
  as mesmas regras com fixtures positivas e negativas, inclusive
  `import()` dinâmico e `require()`, que o `no-restricted-imports` não
  enxerga; varredura real de `src` (imports proibidos e cores fixas —
  hex, `rgb()`, `hsl()`, `oklch()` e cores arbitrárias do Tailwind, só
  permitidas em `tokens.css` e nos specs); verificação das dependências
  do `package.json`; e varredura que prova que nenhum marcador de
  definição de token nem `tailwind.config.*` existe em `libs/config`,
  `libs/api-client`, `libs/queue` e `apps/*/src`; mais um teste estático
  de que os módulos das guardas só leem o sistema de arquivos.

### Convenções de componente e átomos (6.5a)

- **Estrutura:** `src/<camada>/<Componente>/{Componente.tsx,
Componente.spec.tsx, index.ts}`, com as camadas `atoms`, `molecules`,
  `organisms` e `templates`; **named exports** reexportados em
  `src/index.ts`; `src/internal/` (por exemplo `cx`) não é exportado.
- **Props** estendem os atributos nativos (`ComponentPropsWithRef<'button'>`
  etc.); `ref` é prop comum (React 19, sem `forwardRef`); `className` é
  aceito e concatenado por último.
- **Variantes** por mapas fechados de **strings literais completas**, nunca
  por interpolação (o Tailwind só gera classes que lê literalmente).
- **Nenhum texto de interface dentro da lib** (D17): rótulos, `aria-label`
  e mensagens vêm por props.
- **Só classes do contrato de tokens** mais utilitários estruturais
  (espaçamento, flex/grid, display, tamanho, `animate-*`); os tamanhos de
  texto padrão são provisórios.
- **Átomos entregues:** `Button` (`variant`, `size`, `loading` com
  `loadingLabel`), `Badge` (`tone`), `Container` (`as`: `div`, `main` ou
  `section`), `Spinner` (`label`), `Label` (`required`), `FieldError`
  (`id`, `announce`) e `Icon` (o componente de ícone chega pela prop
  `icon`; a lib não importa o catálogo do Tabler).
- **Testes de acessibilidade (D22):** `jest-axe` 11.0.0
  (`toHaveNoViolations`) em cada variante relevante; os **tipos são
  declarados localmente** (`src/internal/jest-axe.d.ts`, não exportado)
  porque `@types/jest-axe` arrasta `@types/jest`, que redeclara o `expect`
  global e conflita com `vitest/globals` (quebrava o typecheck de specs já
  existentes). O contraste de cor continua no `tokens.spec.ts`, porque o
  jsdom não calcula layout.
- **Guarda de utilitários bloqueados:** em `.ts`/`.tsx` não-spec de
  `libs/ui/src`, `rules.mjs` proíbe as classes que o tema fechado **não
  gera** (usá-las falharia em silêncio, sem estilo): a paleta padrão do
  Tailwind e as escalas internas (`bg-blue-500`, `text-gray-700`,
  `bg-brand-600`…), `black`/`white` como cor, `shadow-(2xs|xs|sm|md|lg|xl|
2xl|inner)`, `inset-shadow-*`, `drop-shadow-*`, `text-shadow-*` e
  `rounded-(xs|lg|xl|2xl|3xl|4xl)` (com lado opcional). A lista foi fixada
  por **compilação real** de 782 classes: além do que se esperava, `shadow-2xs`,
  `shadow-xs`, `shadow-inner`, `rounded-xs` e `rounded-4xl` também deixam
  de sair; já `inset-shadow-*`, `drop-shadow-*` e `text-shadow-*` **eram**
  gerados por padrão e passaram a ser fechados em `tokens.css`.

### Moléculas e `TextInput` (6.5b)

- **`TextInput`:** `type` restrito a `text | email | password | search | tel |
url | number`; `invalid` (ou `aria-invalid` vindo de fora) aplica
  `aria-invalid` e o estilo `danger`. A borda do controle usa
  `content-muted` (contraste de não-texto 5,87:1), e não o token decorativo
  `border` (1,43:1 sobre `surface-raised`), sem criar token novo.
- **`FormField`:** os **ids são gerados com `useId`** pelo próprio componente
  e entregues ao controle por **render prop** (`children: (control) =>
ReactNode`, com `id`, `aria-describedby`, `aria-invalid` e `required`);
  **sem `cloneElement`** e sem exigir que o filho seja o `TextInput`.
  `aria-describedby` lista o hint e depois o erro, só os presentes.
- **`Dialog`:** sobre `@headlessui/react`; `title` é o nome acessível e
  `closeLabel` é **obrigatório** (nome do botão de fechar), sem texto
  fixo. O fundo usa `bg-content/50` (token existente com opacidade).
- **`Tabs`:** sobre `@headlessui/react`, API por dados; `label` é
  **obrigatório** (nome da `tablist`).
- **`EmptyState`** e **`Alert`:** tudo por props. O `Alert` usa só tokens
  existentes (`info` = barra `primary`), com texto sempre `content` sobre
  `surface`; `danger` é `role="alert"` e os demais `role="status"`, sem
  ícone fixo.
- **Contraste:** o `tokens.spec.ts` passou a cobrir também os pares
  novos: texto ≥ 4,5:1 (`primary-foreground` sobre `danger` e `success`,
  `content-muted` e `danger` sobre `surface-raised`, `primary` sobre
  `surface` e `surface-raised`) e não-texto ≥ 3:1 (bordas de controle,
  contornos de foco e barras de tom).
- **`axe-core`** passou a ser `devDependency` exata de `libs/ui` (4.12.1,
  a versão já resolvida pelo `jest-axe`), para que `jest-axe.d.ts` não
  dependa de hoisting; o `yarn.lock` só ganhou essa linha no workspace.

### Organismos e templates (6.6)

- **Navegação como dados:** `NavItem` (`{ id, label, href, icon?, current? }`)
  e `RenderLink` (`{ href, className, 'aria-current'?, children }`) são tipos
  da lib; **nenhum dado concreto de navegação, rota ou persona existe na
  lib** (D10). O `renderLink` padrão é um `<a>`; o consumidor injeta o link
  do roteador, e a lib **não importa `next/*`**.
- **`AppHeader`:** `onMenuClick` exige `menuLabel` por tipo (união
  discriminada); `menuExpanded` e `menuControls` são opcionais.
- **`SideNav`:** `label` obrigatório (nome do landmark); o item `current`
  recebe `aria-current="page"` e se distingue por cor (`primary` sobre
  `surface`) e por peso, só com tokens existentes.
- **`AppShell`:** `skipLinkLabel` obrigatório; com `sidebar`, `menuLabel` e
  `closeLabel` passam a ser obrigatórios (união discriminada), e o `header`
  é uma **render prop** que recebe as props do botão de menu (não há
  `cloneElement`). A barra lateral é fixa a partir de `lg` e **vira gaveta**
  abaixo dele, compondo o `Dialog` do próprio Headless UI (o `Dialog` da
  6.5b é centralizado, e uma gaveta não é). **Estratégia de landmarks:** a
  barra fixa só está no DOM enquanto a gaveta está fechada (abaixo de `lg`
  ela já é `hidden` por CSS, e a gaveta só abre ali), então nunca há mais
  de um `navigation` no DOM (a estratégia de landmarks não depende de JS de
  viewport). As duas limitações da gaveta registradas aqui na 6.6 foram
  corrigidas na 6.6.1 (ver abaixo).
- **`FormPageLayout`:** `title` com `headingLevel` (padrão `h1`),
  `description` e `actions` opcionais, sobre o `Container`.
- **Contraste:** nenhum par novo foi necessário; todos os estados (item
  atual, hover, foco, cabeçalho, gaveta, link de salto) reutilizam pares já
  cobertos pelo `tokens.spec.ts`.

**Riscos registrados para a 6.8 (com o Figma):**

- O token `border` dá **1,43:1** sobre `surface-raised` (1,36:1 sobre
  `surface`): serve como divisor decorativo, **não** como limite de
  controle (não-texto exige 3:1). Os limites de controle usam
  `content-muted`. Decidir o valor do token com o Figma.
- `blur-*` e `backdrop-blur-*` continuam sendo gerados (namespaces fora dos
  resets); revisar se devem ser fechados.

### Correção da gaveta (6.6.1)

- **Fechar ao navegar, por contexto interno:** `AppShell` provê um
  `DrawerContext` (`src/internal/drawer-context.ts`, não exportado pelo
  pacote) **só em volta do conteúdo da gaveta**; o `SideNav` lê o contexto
  (com valor padrão inerte fora do `AppShell`) e chama `closeDrawer` no
  clique de cada item. Sem `cloneElement`, sem delegação de clique em `div`
  e sem supressão de lint. Cliques que abrem outra aba ou janela (Ctrl, Cmd,
  Shift, Alt ou botão que não seja o principal) **não** fecham a gaveta.
- **`onClick` em `NavLinkProps`:** é a única mudança de API pública. O
  consumidor deve repassá-lo ao elemento que o `renderLink` devolve; um
  `renderLink` que não o repassa continua funcionando, mas a gaveta fica
  aberta após navegar (contrato documentado no README e testado).
- **Fechar ao cruzar `lg`:** `useMediaQuery` (`src/internal/use-media-query.ts`,
  sobre `useSyncExternalStore`) observa `(min-width: 64rem)`; o `AppShell`
  fecha a gaveta quando a consulta passa a corresponder (estado ajustado
  durante a renderização, sem efeito). Uma gaveta aberta ao passar de `lg`
  continuaria modal e invisível (`lg:hidden`); por isso o `matchMedia` foi
  autorizado **apenas para este fim** e existe em **um único arquivo** de
  `src` (o hook). Sem `window.matchMedia` (jsdom, servidor) o hook devolve
  `false` e não assina nada; o listener é removido ao desmontar.
- **Constante única:** `BREAKPOINT_LG = '64rem'`; um teste a compara com
  `--breakpoint-lg` de `tokens.css`, para que não divirjam.

### Storybook (6.7)

- **Configuração** em `libs/ui/.storybook/`: `main.ts` (framework
  `@storybook/react-vite`, stories em `../src/**/*.stories.@(ts|tsx)`, addon
  `@storybook/addon-a11y` e o plugin `@tailwindcss/vite` adicionado em
  `viteFinal`) e `preview.ts` (importa `styles.css`; sem dark mode, D19, e sem
  texto de interface). **Sem `vite.config.ts` na lib**, sem `@nx/storybook`,
  sem outros addons; a verificação de tipos ganhou `tsconfig.storybook.json`.
- **Targets Nx** (`nx:run-commands`, `cwd: libs/ui`): `storybook:build`
  (`storybook build`, `cache: true`, `outputs` em `storybook-static`, `inputs`
  explícitos: `src`, `.storybook`, README, `package.json`, tsconfigs e as
  dependências externas do Storybook e do Tailwind) e `storybook` (servidor de
  desenvolvimento, sem cache). `storybook:build` entrou no `validate:nx`
  (D13); `storybook-static` é ignorado pelo Git, pelo Prettier e pelo ESLint.
- **Stories:** uma por componente exportado (17) mais a página
  `Foundations/Tokens`, com textos de demonstração em português **dentro das
  stories** (a lib segue sem texto fixo, D17). A story `AppShell/MobileDrawer`
  usa um viewport móvel e uma função `play` que abre a gaveta.
- **Página "Tokens":** lê `tokens.css` e o README por `?raw` e lista os tokens
  semânticos do `@theme` (cores, espaçamento, raios, sombras, pontos de quebra
  e fonte) com o valor resolvido e uma amostra desenhada por `var(--token)`;
  as escalas internas `--scale-*` **não** aparecem. O parser é uma função pura
  (`tokens-parser.ts`, com testes positivos e negativos) que **lança erro** em
  entrada malformada, e também roda em `viteFinal`, então um arquivo quebrado
  falha o teste e o build em vez de renderizar uma lista vazia. Como o Tailwind
  só emite a variável de um token que algum utilitário usa, `tokens-samples.ts`
  lista um utilitário por token amostrável, e um teste falha se um token novo
  não estiver no mapa.
- **Testes de stories:** todas as stories são carregadas por `import.meta.glob`,
  compostas com `composeStories` (portable stories), renderizadas e verificadas
  com `axe` (no `container`, ou em `document.body` quando há portal: `Dialog`
  aberto e gaveta); outro teste exige que todo componente exportado por
  `src/index.ts` tenha um `*.stories.tsx` (com controle negativo). Nenhum teste
  escreve em disco. Para o `?raw` de `tokens.css` funcionar no Vitest, o
  `vitest.config.mts` da lib processa esse arquivo (`css.include`), pois o
  Vitest devolve string vazia para CSS não processado.

**Medições para a D13** (a D13 **não** foi alterada; ver "Riscos residuais" no
roadmap): `storybook:build` a frio leva ~9,6 s no total (mediana de 3 execuções:
9,56 s; o Nx mede 4,9 s e o Vite 3,2 s); com cache, o acerto leva dezenas de
milissegundos no Nx e o erro após alterar uma story ~5,2 s; a saída (57 stories
em 18 títulos, 67 arquivos, ~7,8 MB) é idêntica entre execuções, exceto o campo
`generatedAt` de `project.json`. O `yarn validate` sem cache passou de ~38,6 s
(média de 2 execuções) para ~43,5 s (mediana de 5 execuções, de 38,9 a 46,7 s), cerca de **+13%**; com cache
quente, de 14,2 s para 15,2 s.

**Interpretação do critério de aceite.** O critério da Fase 6 ("sem
nenhum ajuste retroativo necessário em `libs/ui` motivado pelo
frontend") **não** considera "ajuste retroativo" a **troca de valores de
token**: os valores são provisórios (D3), o Figma pode alterá-los, e o
nome do token permanece. Ajuste retroativo é mudar a API, a estrutura ou
os nomes de componentes e tokens por necessidade do frontend.

### Condições de parada do spike 6.1 (D16)

Parar e reportar opções, sem decidir, se: qualquer incompatibilidade com
TypeScript 6, Vite 8 ou Node 24; o Tailwind não tiver caminho viável
para tokens compartilhados consumíveis de fora de `libs/ui`; o Storybook
não buildar; o consumo por um app mínimo exigir ajuste na estrutura de
`libs/ui`; ou algum peer virar erro de instalação. Sem override, sem
`--legacy-peer-deps`.

### Gatilho de revisão (peers)

Nenhuma exceção de peer foi necessária no spike 6.1 (nenhum `YN0060`;
apenas avisos `YN0002` de "não fornece"). Esta ADR é revisada se
surgir, em subtarefa posterior, uma incompatibilidade de peer com o
TypeScript 6, ou se o workspace mudar de major do TypeScript. Qualquer
exceção de peer exigiria decisão explícita do responsável, registrada
aqui; sem essa decisão, vale D16.

### Versões definitivas (6.2)

Aprovadas e instaladas na 6.2 com versões **exatas** (sem `^` nem `~`) em
`libs/ui/package.json`; `vite`, `vitest` e `typescript` continuam os da
raiz. Nenhum `YN0060` e nenhum peer virou erro; `react` e `react-dom`
têm uma única versão resolvida.

| Pacote                               | Versão                               | Onde                                                 |
| ------------------------------------ | ------------------------------------ | ---------------------------------------------------- |
| `tailwindcss`, `@tailwindcss/vite`   | 4.3.3                                | `devDependencies`                                    |
| `storybook`, `@storybook/react-vite` | 10.6.3                               | `devDependencies`                                    |
| `@storybook/addon-a11y`              | 10.6.3 (acompanha o Storybook)       | `devDependencies`                                    |
| `react`, `react-dom`                 | 19.3.1                               | `devDependencies`; `peerDependencies` `>=19.0.0 <20` |
| `@types/react`                       | 19.3.0                               | `devDependencies`                                    |
| `@types/react-dom`                   | 19.3.0 (peer `@types/react ^19.3.0`) | `devDependencies`                                    |
| `@headlessui/react`                  | 2.2.10                               | `dependencies`                                       |
| `@tabler/icons-react`                | 3.49.0                               | `dependencies`                                       |
| `jsdom`                              | 30.1.3                               | `devDependencies`                                    |
| `@testing-library/react`             | 16.3.3                               | `devDependencies`                                    |
| `@testing-library/user-event`        | 14.6.8                               | `devDependencies`                                    |
| `@testing-library/jest-dom`          | 7.0.1                                | `devDependencies`                                    |
| `@testing-library/dom`               | 10.4.2                               | `devDependencies`                                    |
| `eslint-plugin-react-hooks`          | 7.1.1                                | `devDependencies`                                    |
| `eslint-plugin-jsx-a11y`             | 6.10.2                               | `devDependencies`                                    |

`@storybook/addon-a11y` e `@types/react-dom` eram os dois pacotes sem
número no spike; não foi necessário nenhum outro acessório de tipos.

### Resultados do spike 6.1

Spike executado fora do repositório (diretório temporário já removido),
com Yarn 4.12.0, TypeScript 6.0.3, Vite 8 e Node 24, sem override, sem
`resolutions` e sem `--legacy-peer-deps`. O repositório permaneceu
idêntico. Nenhuma condição de parada disparou.

- **Versões encontradas** (as definitivas estão em
  [Versões definitivas (6.2)](#versões-definitivas-62)):
  Tailwind, `@tailwindcss/vite`, `@tailwindcss/postcss` e
  `@tailwindcss/cli` 4.3.3; `storybook` e `@storybook/react-vite`
  10.6.3; React e `react-dom` 19.3.1; `@types/react` 19.3.0; Next
  16.4.2; `@headlessui/react` 2.2.10; `@tabler/icons-react` 3.49.0;
  Vitest 4.1.11 com `jsdom` 30.1.3 (e `happy-dom` 21.0.4 como
  comparação); `@testing-library/react` 16.3.3, `user-event` 14.6.8,
  `jest-dom` 7.0.1 e `dom` 10.4.2; `eslint-plugin-react-hooks` 7.1.1;
  `eslint-plugin-jsx-a11y` 6.10.2.
- **Tailwind**: sem `@source`, as classes da lib não aparecem no CSS do
  consumidor. Funcionam `@source` no app ou um `styles.css` exportado
  pela lib com `@import "tailwindcss"` e `@source` relativo ao próprio
  arquivo; `@source` via `node_modules` não funciona. O CSS gerado é
  idêntico em duas execuções.
- **Storybook**: o servidor de desenvolvimento respondeu HTTP 200 em
  `localhost`; o build levou ~3,1 a 3,4 s, com 7,6 MB e 5 stories.
- **Consumo (D6)**: a fonte TS/TSX funcionou em Vite 8 e no Next 16.4.2
  (Turbopack e webpack), com e sem `transpilePackages`; o `dist` ESM
  também funcionou; o `dist` CJS falhou no Next
  (`createContext is not a function`) e, no Vite, gerou JS de 3,3 MB
  contra 220 KB do ESM.
- **TypeScript 6**: configuração mínima validada para a lib React —
  herdar do `tsconfig.base.json`; `jsx: react-jsx`; `lib` com `DOM` e
  `DOM.Iterable`; `module: ESNext`; `moduleResolution: bundler`; `types`
  com `vitest/globals`, `@testing-library/jest-dom` e `vite/client`
  (este último é necessário para importar CSS no `preview` com TS 6).
- **Vitest**: sem plugin React; `environment: 'jsdom'` e um arquivo de
  setup com `@testing-library/jest-dom/vitest`.
- **Nx**: `nx:run-commands` com cache funcionou (segunda execução lida
  do cache); `@nx/storybook` adicionaria ~227 pacotes ao lockfile.
- **Limites do spike**: componentes de exemplo, não os definitivos; o
  objeto TS que geraria o CSS não foi testado; a causa do erro do CJS no
  Next não foi isolada; Node nativo com ESM e extensões explícitas não
  foi testado.

## Consequências

**Positivas**:

- `libs/ui` isolada e documentada antes do `apps/web`, sem dependência
  circular entre frontend e design system.
- Tokens em um único lugar (CSS como fonte, se viável), lidos pelo
  Tailwind e pelo Storybook; trocar valores é editar um arquivo.
- O isolamento de `libs/ui` é imposto por ESLint e por teste permanente
  no `yarn validate`, não por revisão (D12).

**Negativas / trade-offs aceitos**:

- Dependências de UI (React, Tailwind e afins) passam a ser instaladas
  nas imagens da API e do worker, porque os Dockerfiles acompanham o
  grafo de workspaces (D14); refatorá-los seria mudança de
  infraestrutura, separada.
- Storybook no `validate:nx` aumenta a duração do `yarn validate` (D13);
  a decisão é reavaliada com a duração medida na 6.7.
- `libs/ui` é consumida como fonte TS/TSX (D6), o que pede configuração
  do consumidor na Fase 7 (`transpilePackages` explícito e `@source` ou
  `styles.css` do Tailwind).
- `libs/ui` é ESM (D6b), diferente das libs de backend (CommonJS), e só
  roda em bundlers: imports relativos sem extensão não funcionam no Node
  nativo.

## Fora de escopo

- Dark mode (D19), i18n (D17), carregamento de fontes (D18), `Toast`,
  mapas, Stripe e qualquer componente de domínio.
- `apps/web` (Fase 7), incluindo os dados de menu por persona (D10) e a
  montagem de cada área.
- Alterar o `tsconfig.json` raiz (D20), salvo necessidade demonstrada.
- Alterar a ADR 003 ou qualquer outra ADR.
