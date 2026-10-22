# ADR 010 — Fundação de UI: `libs/ui`, tokens, Tailwind e Storybook

## Status

Proposed

Esta ADR é aberta pela subtarefa 6.0 da Fase 6
([docs/IMPLEMENTATION_ROADMAP.md](../IMPLEMENTATION_ROADMAP.md)). Ela
**complementa** a [ADR 003](003-frontend-organization.md) — que decidiu
Atomic Design + feature-first, um único app Next.js, Tailwind CSS como
fundação visual, Headless UI, Tabler Icons e Storybook — e **não a
altera nem a supersede**. Passa a `Accepted` somente no fechamento da
Fase 6 (subtarefa 6.9). As ADRs 001–009 permanecem inalteradas.

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

Cada decisão carrega o estado na abertura da fase: **aprovada**,
**aprovada condicional** ao spike 6.1, **decidida pelo spike 6.1**,
**aprovada com integração pendente do spike**, **aprovada, a reavaliar
com dado medido** ou **regra aprovada**.

| ID  | Pergunta                                 | Alternativas                                                                                          | Decisão aprovada                                                                                                                            | Consequência                                                                                               | Estado                                    |
| --- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| D1  | Branch da fase                           | partir da atual; do `main` após merge                                                                 | `feat/phase-6-ui` a partir da branch atual (`d3c91f8`)                                                                                      | PR e merge ficam para depois                                                                               | Aprovada                                  |
| D2  | Formato dos tokens                       | CSS como fonte única; objeto TS que gera o CSS                                                        | CSS como fonte única, se o Tailwind escolhido suportar                                                                                      | Tailwind e Storybook leem o mesmo arquivo; trocar valores é editar um arquivo                              | Aprovada, condicional ao spike 6.1        |
| D3  | Paleta e nomes                           | escalas numeradas; camada semântica (`primary`, `surface`, `text`, `danger`, `success`) sobre escalas | Camada semântica sobre escalas, com valores provisórios derivados da paleta do front antigo                                                 | Componentes usam só nomes semânticos; o Figma mapeia nome a nome                                           | Aprovada                                  |
| D4  | Contrato de nomes com o Figma            | só o README; README + página no Storybook                                                             | README da lib + página "Tokens" no Storybook                                                                                                | O Figma usa variáveis com os mesmos nomes; o valor muda, o nome não                                        | Aprovada                                  |
| D5  | Versão e integração do Tailwind          | fixar agora; decidir após o spike                                                                     | Decidir pelo spike 6.1                                                                                                                      | Pode mudar o formato de D2                                                                                 | Decidida pelo spike 6.1                   |
| D6  | Como `apps/web` consome `libs/ui`        | fonte TS/TSX; `dist` compilado                                                                        | Recomendação: fonte TS/TSX; decisão final após o spike                                                                                      | Afeta a Fase 7 (`transpilePackages`); `dist` exigiria build de React e CSS                                 | Decidida pelo spike 6.1                   |
| D7  | Storybook                                | `@storybook/react-vite`; framework Next                                                               | `@storybook/react-vite`                                                                                                                     | `libs/ui` não depende do Next; integração Nx por `nx:run-commands` ou `@nx/storybook` a definir pelo spike | Aprovada; integração Nx pendente do spike |
| D8  | Teste de componentes                     | Vitest + jsdom + Testing Library; só interaction tests do Storybook                                   | Vitest + jsdom + Testing Library, mais o addon a11y do Storybook                                                                            | Segue a stack já aprovada (`TARGET_ARCHITECTURE.md` seção 13)                                              | Aprovada                                  |
| D9  | Conjunto mínimo de componentes           | (lista abaixo)                                                                                        | Conjunto abaixo                                                                                                                             | Um conjunto maior seria especulação sem design                                                             | Aprovada                                  |
| D10 | Onde ficam os dados de menu das personas | `apps/web`; `libs/ui`; `libs/config`                                                                  | `apps/web` (Fase 7)                                                                                                                         | `libs/ui` continua sem conhecer persona                                                                    | Aprovada                                  |
| D11 | Templates da Fase 6                      | só `AppShell`; `AppShell` + `FormPageLayout`; mais                                                    | `AppShell` + `FormPageLayout`                                                                                                               | O `AppShell` precisa nascer na Fase 6 por causa do critério "sem ajuste retroativo"                        | Aprovada                                  |
| D12 | Como garantir o isolamento de `libs/ui`  | convenção; ESLint; ESLint + teste                                                                     | ESLint (`no-restricted-imports`) + teste permanente                                                                                         | A regra falha o `yarn validate`, sem depender de revisão                                                   | Aprovada                                  |
| D13 | Storybook no `yarn validate`             | no `validate:nx` com cache; separado                                                                  | No `validate:nx`, com cache; reavaliar com a duração medida na 6.7                                                                          | Evita Storybook quebrar em silêncio, ao custo de tempo                                                     | Aprovada; a reavaliar com dado medido     |
| D14 | Dockerfiles e o novo workspace           | acompanhar o grafo (a guarda exige); refatorar Dockerfiles para instalar só o necessário              | Acompanhar o grafo; registrar o aumento de instalação como risco com gatilho                                                                | Refatorar os Dockerfiles seria mudança de infraestrutura, separada                                         | Aprovada                                  |
| D15 | Plugins de ESLint                        | adicionar `react-hooks` e `jsx-a11y`; não adicionar                                                   | Adicionar, se o spike confirmar compatibilidade com ESLint 9.39                                                                             | Mais dependências, mas acessibilidade vira regra                                                           | Aprovada, condicional ao spike 6.1        |
| D16 | Regra de peers (TypeScript 6)            | igual ao D7 da Fase 5                                                                                 | Sem override, sem `--legacy-peer-deps`, sem troca de ferramenta, sem rebaixar o TypeScript; em qualquer incompatibilidade, parar e reportar | Mesmo padrão já validado                                                                                   | Regra aprovada                            |
| D17 | i18n                                     | biblioteca já; textos por props; adiar                                                                | Textos sempre por props, sem biblioteca (a ADR 003 não define i18n)                                                                         | Evita travar a Fase 6 numa decisão que a ADR deixou fora                                                   | Aprovada                                  |
| D18 | Fontes                                   | carregar Inter em `libs/ui`; só o token com fallback                                                  | Só o token `font-sans` com pilha de fallback; o carregamento da fonte é do consumidor (`next/font` na Fase 7)                               | `libs/ui` não carrega arquivos de fonte                                                                    | Aprovada                                  |
| D19 | Dark mode                                | agora; adiar                                                                                          | Adiar (os tokens semânticos deixam a porta aberta)                                                                                          | Sem custo de design agora                                                                                  | Aprovada                                  |
| D20 | `tsconfig.json` da raiz                  | alterar; manter                                                                                       | Manter, salvo necessidade demonstrada                                                                                                       | Já é um risco registrado com gatilho                                                                       | Aprovada                                  |
| D21 | Registro das decisões                    | ADR; só roadmap                                                                                       | ADR 010 `Proposed` na 6.0 e `Accepted` no fechamento                                                                                        | Mais um documento, decisões duráveis rastreáveis                                                           | Aprovada                                  |

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

Esta ADR é revisada se um pacote de UI declarar suporte ao TypeScript 6
depois de uma incompatibilidade registrada na 6.1 ou em subtarefa
posterior, ou se o workspace mudar de major do TypeScript. Qualquer
exceção de peer exigiria decisão explícita do responsável, registrada
aqui; sem essa decisão, vale D16.

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
- `libs/ui` tende a ser consumida como fonte TS/TSX (D6, a confirmar no
  spike 6.1), o que pede configuração do consumidor na Fase 7
  (`transpilePackages`).

## Fora de escopo

- Dark mode (D19), i18n (D17), carregamento de fontes (D18), `Toast`,
  mapas, Stripe e qualquer componente de domínio.
- `apps/web` (Fase 7), incluindo os dados de menu por persona (D10) e a
  montagem de cada área.
- Alterar o `tsconfig.json` raiz (D20), salvo necessidade demonstrada.
- Alterar a ADR 003 ou qualquer outra ADR.
