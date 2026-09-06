# Mockp

Mockp é uma plataforma imobiliária que conecta clientes, corretores e
corretoras.

O workspace Yarn/Nx, `libs/config` e o skeleton técnico da API NestJS
(`apps/api`) já estão implementados (Fases 0 a 2, `Completed`). A Fase 3
(persistência e infraestrutura local) está `In Progress`: a
especificação técnica (Tarefa 3.0) foi aprovada e a Tarefa 3.1 (Docker
Compose com PostGIS e Redis) está autorizada a começar — nenhuma
dependência foi instalada e nenhum Prisma, Docker/Docker Compose,
PostGIS, Redis, worker ou frontend existe ainda no repositório. Antes
de qualquer novo scaffold ou implementação, leia a documentação
abaixo — ela é a fonte de verdade do projeto.

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

- **Fase 0 — Fundação e revisão documental**: `Completed`. A revisão
  documental foi aprovada pelo responsável pelo projeto.
- **Fase 1 — Yarn 4 e Nx**: `Completed`. Aprovada tecnicamente pelo
  responsável pelo projeto.
- **Fase 2 — API NestJS (skeleton da API)**: `Completed`. Revisão
  técnica aprovada pelo responsável pelo projeto. Esta fase autorizou
  somente o skeleton técnico da API (`apps/api`) e `libs/config`
  (entrypoint server-only) — sem persistência, sem worker, sem web, sem
  autenticação e sem domínio de negócio.
- **Fase corrente**: Fase 3 — Docker, PostGIS, Redis e Prisma —
  **In Progress**. A Tarefa 3.0 (abertura documental e especificação
  técnica) está concluída e aprovada —
  [ADR 006](docs/adr/006-persistence-and-local-infrastructure.md)
  está `Accepted`. A Tarefa 3.1 (Docker Compose com PostGIS e Redis) é
  a tarefa autorizada agora; as Tarefas 3.2 a 3.6 ainda não estão
  autorizadas.
- Repositório com workspace Yarn/Nx configurado e o skeleton técnico da
  API NestJS implementado; ainda sem Next.js, Prisma, Docker ou libs de
  produto além de `libs/config`.
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
