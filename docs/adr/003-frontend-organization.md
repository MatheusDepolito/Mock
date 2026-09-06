# ADR 003 — Organização do frontend: Atomic Design + feature-first, único app Next.js

## Status

Accepted

## Contexto

O Mockp atende quatro personas (`customer`, `agent`, `manager`,
`admin`) que precisam de experiências distintas, mas compartilham
conta, autenticação e boa parte do design system. O projeto de
referência anterior utilizava quatro frontends separados (ver
[docs/REFERENCE_REPOSITORY.md](../REFERENCE_REPOSITORY.md)), o que
multiplicava esforço de build, deploy e manutenção de design system.
Era necessário decidir como estruturar o código de UI de forma que
componentes genéricos fossem reutilizáveis sem acoplar regra de domínio
a eles, e sem multiplicar aplicações.

## Decisão

- Um **único app Next.js** (App Router) atende as quatro personas, com
  áreas internas `/customer`, `/agent`, `/manager`, `/admin`.
- **Feature-first** define onde o código de negócio vive: cada domínio
  tem sua pasta de feature própria (componentes, hooks, query keys,
  lógica específica).
- **Atomic Design** define o nível de composição visual dentro do
  design system genérico (`libs/ui`): `atoms`, `molecules`, `organisms`,
  `templates`.
- Componentes visuais genéricos ficam em `libs/ui`; componentes de
  domínio ficam em `features/<domain>`.
- Componentes de `libs/ui` não acessam API, Auth.js, TanStack Query ou
  tipos de domínio.
- `templates` não executam requests nem regras de autorização.
- `page.tsx` permanece fino, apenas compondo features e templates.
- Tailwind CSS é a fundação visual, com design tokens centralizados;
  Headless UI pode ser usado para primitives acessíveis; Tabler Icons é
  a biblioteca de ícones; Storybook documenta `libs/ui`.
- TanStack Query controla estado remoto; React Hook Form + Zod são
  usados em formulários.

## Consequências

**Positivas**:

- Um único pipeline de build/deploy para o frontend, em vez de quatro.
- Design system único (`libs/ui`) compartilhado por todas as personas,
  reduzindo duplicação visual e inconsistência.
- Separação entre "onde o negócio vive" (feature-first) e "como a UI é
  composta" (Atomic Design) evita que `libs/ui` acumule regra de
  domínio ao longo do tempo.
- Área por persona dentro do mesmo app facilita cenários de usuário com
  múltiplos papéis simultâneos.

**Negativas / trade-offs aceitos**:

- Um único app cresce mais em tamanho de bundle/rotas do que quatro
  apps pequenos — mitigado por code splitting nativo do App Router por
  segmento de rota.
- Times ou permissões de deploy por persona (caso venham a ser
  necessários) exigiriam solução dentro do mesmo app (ex.: feature
  flags), não isolamento por deploy separado.

## Fora de escopo

- Definição de permissões de UI por papel dentro de cada área (o "o
  que" cada persona vê) não é detalhada nesta ADR — é consequência das
  regras de autorização definidas em
  [ADR 004](004-auth-ownership.md).
- Estratégia de i18n não é definida nesta ADR.
- Divisão das quatro áreas em aplicações separadas no futuro exigiria
  uma nova ADR revisando esta decisão.
