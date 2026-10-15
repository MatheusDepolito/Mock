# Mockp

Mockp é uma plataforma imobiliária que conecta clientes, corretores e
corretoras.

**Estado**: nenhuma fase está `In Progress`. As Fases 0 a 5 estão
`Completed` (a última concluída é a **Fase 5 — OpenAPI e api-client**) e
a Fase 6, a próxima do roadmap, está `Pending`, assim como as Fases 7 a 9. O status detalhado, por fase e subtarefa, e os riscos residuais estão
no [roadmap](docs/IMPLEMENTATION_ROADMAP.md#fase-corrente). Antes de
qualquer novo scaffold ou implementação, leia a documentação abaixo —
ela é a fonte de verdade do projeto.

## Ordem de leitura recomendada

1. [AGENTS.md](AGENTS.md) — regras obrigatórias para quem (humano ou agente)
   for trabalhar neste repositório.
2. [docs/PRODUCT_CONTEXT.md](docs/PRODUCT_CONTEXT.md) — produto, personas e
   jornadas, presentes e futuras.
3. [docs/TARGET_ARCHITECTURE.md](docs/TARGET_ARCHITECTURE.md) — stack,
   estrutura de monorepo, camadas e fluxos. Principal fonte de verdade
   arquitetural.
4. [docs/REFERENCE_REPOSITORY.md](docs/REFERENCE_REPOSITORY.md) — o que
   aproveitar e o que descartar de um projeto anterior usado como
   referência.
5. [docs/IMPLEMENTATION_ROADMAP.md](docs/IMPLEMENTATION_ROADMAP.md) —
   divisão da construção em fases pequenas e incrementais.
6. [docs/adr/](docs/adr/) — registros de decisão arquitetural (ADRs).

## Estado atual

- **Fase corrente**: nenhuma fase `In Progress`. Fases 0 a 5
  `Completed` (ADR 009 `Accepted`); Fase 6 — a próxima — e Fases 7 a 9
  `Pending`. A fonte única do status é o
  [roadmap](docs/IMPLEMENTATION_ROADMAP.md#fase-corrente); os riscos
  residuais aceitos, com seus gatilhos, estão em
  [Riscos residuais e gatilhos](docs/IMPLEMENTATION_ROADMAP.md#riscos-residuais-e-gatilhos).
- **O que já existe**: workspace Yarn 4 + Nx; `apps/api` (NestJS, com
  health checks, readiness real contra PostgreSQL/PostGIS e Redis,
  Prisma e repositories por agregado); `apps/worker` e `libs/queue`
  (BullMQ); `libs/config`; `libs/api-client` (tipos gerados e cliente
  `openapi-fetch` a partir do contrato OpenAPI versionado, com
  `contract:check` no `yarn validate`); infraestrutura local via Docker
  Compose (PostgreSQL/PostGIS e Redis); Dockerfiles da API e do worker.
- **O que ainda não existe**: `apps/web`, Next.js, `libs/ui`,
  autenticação, domínio de negócio exposto por HTTP e os adapters de
  Stripe e Mapbox (fases posteriores).
- Segue [docs/IMPLEMENTATION_ROADMAP.md](docs/IMPLEMENTATION_ROADMAP.md),
  que define o status de cada fase (`Pending`, `In Progress`,
  `Completed`, `Blocked`).
- Este README deve ser atualizado, na mesma alteração que o roadmap,
  sempre que a fase corrente mudar.

## Validação local

`yarn validate` é o comando oficial de validação antes de concluir
qualquer tarefa — roda `format:check`, o lint do workspace (incluindo
arquivos de configuração na raiz) e, via `validate:nx`, os targets
cacheáveis do Nx (`lint`, `typecheck`, `test`, `build` de todos os
projetos e `api:test:integration`). Um hook `pre-commit` do Husky
executa `yarn validate` automaticamente antes de cada commit local —
isso é uma proteção de desenvolvimento, não substitui CI. Em ambientes
sem Git (ex.: imagens Docker), desabilite a instalação/execução dos
hooks com `HUSKY=0` (ex.: `HUSKY=0 yarn install`).

## Stack (planejada)

TypeScript strict, Yarn 4, Nx, NestJS (REST + OpenAPI/Swagger), Next.js
(App Router), TanStack Query, Tailwind CSS, React Hook Form + Zod,
PostgreSQL + PostGIS, Prisma, Redis, BullMQ, Stripe, Mapbox, Docker e
Docker Compose. Detalhes completos em
[docs/TARGET_ARCHITECTURE.md](docs/TARGET_ARCHITECTURE.md).
