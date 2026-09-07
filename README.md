# Mockp

Mockp é uma plataforma imobiliária que conecta clientes, corretores e
corretoras.

O workspace Yarn/Nx, `libs/config` e o skeleton técnico da API NestJS
(`apps/api`) já estão implementados (Fases 0 a 2, `Completed`). A Fase 3
(persistência e infraestrutura local) está `In Progress`: a
especificação técnica (Tarefa 3.0), o Docker Compose com PostGIS e
Redis (Tarefa 3.1) e a **Tarefa 3.2** (Prisma, schema, migration
inicial e seed) estão **`Completed`** e aprovadas. **Prisma `7.10.0`,
seus arquivos de configuração, `schema.prisma`, migration e seed já
existem** no repositório, implementando a modelagem multi-tenant
(`Workspace`) da
[ADR 007](docs/adr/007-multi-tenant-workspace-foundation.md)
(`Accepted` — supersede exclusivamente a modelagem de dados da ADR 006;
as decisões de infraestrutura/pipeline da ADR 006 continuam válidas),
validados offline e em banco limpo (auditoria independente aprovada).
**Somente a Tarefa 3.3 está autorizada a começar** (ainda não
iniciada); as Tarefas 3.4 a 3.6 continuam bloqueadas. Nenhum
`PrismaModule`, `PrismaService`, repository, conexão de runtime da API
com o banco, readiness real, Dockerfile da API, worker ou frontend
existe ainda no repositório. Antes de qualquer novo scaffold ou
implementação, leia a documentação abaixo — ela é a fonte de verdade do
projeto.

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
  **In Progress**. As Tarefas 3.0 (abertura documental e especificação
  técnica), 3.1 (Docker Compose com PostGIS e Redis) e **3.2** (Prisma,
  schema, migration inicial e seed) estão **`Completed`** e aprovadas —
  [ADR 006](docs/adr/006-persistence-and-local-infrastructure.md) e
  [ADR 007](docs/adr/007-multi-tenant-workspace-foundation.md) estão
  ambas `Accepted` (ADR 007 supersede exclusivamente a modelagem de
  dados da ADR 006; as decisões de infraestrutura/pipeline da ADR 006
  continuam válidas). A infraestrutura local inclui `postgres`
  (`postgis/postgis:18-3.6`) e `redis` (`redis:8.8.2-alpine`), com os
  bancos `mockp`/`mockp_test`, healthchecks e volumes nomeados
  separados; `DATABASE_URL`/`REDIS_URL` são obrigatórias no
  `ServerConfig`, e `TEST_DATABASE_URL` é exclusiva de testes/scripts.
  Prisma, seus arquivos de configuração, `schema.prisma`, migration e
  seed já existem, implementando a modelagem multi-tenant de 15
  entidades da ADR 007, validada offline e em banco limpo (auditoria
  independente aprovada). Nenhum `PrismaModule`, `PrismaService`,
  repository, conexão de runtime da API com o banco ou Dockerfile da
  API existe ainda. **Somente a Tarefa 3.3 está autorizada a começar**
  (ainda não iniciada); as Tarefas 3.4 a 3.6 continuam bloqueadas.
- Repositório com workspace Yarn/Nx configurado, o skeleton técnico da
  API NestJS implementado, PostgreSQL/PostGIS + Redis disponíveis via
  Docker Compose, e Prisma (schema, migration inicial e seed da
  fundação multi-tenant da ADR 007) já implementado e validado — ainda
  sem a integração runtime da API com o Prisma (`PrismaModule`,
  repositories), sem Next.js, sem Dockerfile da API ou libs de produto
  além de `libs/config`.
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
