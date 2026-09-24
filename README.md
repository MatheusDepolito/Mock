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
**A Tarefa 3.3 está `Completed`**, executada subtarefa por subtarefa
(ADR 008 `Accepted`), todas as oito subtarefas aprovadas: **3.3.1**
(`RuntimeConfigModule`/`RedisModule`/`RedisService`, integração com o
Redis exclusivamente lazy), **3.3.2** (`PrismaModule`/`PrismaService`,
conexão com o Prisma exclusivamente lazy), **3.3.3** (composição
offline do `AppModule`, com prova de instância única de
`PrismaService`/`RedisService` no grafo Nest, conforme ADR 008
§7.2/§8), **3.3.4** (harness de infraestrutura real em
`apps/api/test/infra/`, target `api:test:integration:infra`, comando
raiz `yarn validate:infra`), **3.3.5** (`UserRepository`/
`UsersModule`), **3.3.6** (`WorkspaceRepository`/`WorkspacesModule`),
**3.3.7** (`PropertyRepository`/`PropertiesModule`, commit `9e0a1dc`)
e **3.3.8** (validação integrada e fechamento documental, sem nenhum
achado). **168 testes unitários, 44 testes de integração offline e 52
testes de integração com infraestrutura real confirmados ao final da
3.3.8.** **A Tarefa 3.4** (readiness real e testes de falha das
dependências) está **`Completed` e aprovada tecnicamente**:
`GET /api/v1/health/ready` agora checa PostgreSQL/PostGIS e Redis de
verdade — saudável retorna `200` com `checks: { application: 'up',
database: 'up', redis: 'up' }`; falha de qualquer dependência retorna
`503` em Problem Details, `code: SERVICE_UNAVAILABLE`, sem `checks`.
`GET /api/v1/health/live` permanece independente de ambas. **180 testes
unitários, 49 testes de integração offline e 53 testes de integração
com infraestrutura real confirmados ao final da 3.4**, incluindo
validação operacional manual (parada/recuperação individual de
`redis`/`postgres`, com `503`/`200` e liveness `200` confirmados).
**A Tarefa 3.5** (Dockerfile da API) está **`Completed` e aprovada
tecnicamente**: [apps/api/Dockerfile](apps/api/Dockerfile) multi-stage,
usuário não-root, sem depender de `node_modules`/arquivos do host,
validado com build real da imagem, inicialização da API a partir dela
com liveness/readiness saudáveis contra o `postgres`/`redis` locais, e
execução explícita e idempotente de `migrate deploy` contra
`mockp_test`. A Tarefa 3.6 continua bloqueada — só inicia com
autorização própria. Nenhum Dockerfile de worker ou frontend existe
ainda no repositório. Antes de qualquer novo scaffold ou implementação,
leia a documentação abaixo — ela é a fonte de verdade do projeto.

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
  independente aprovada).
  **A Tarefa 3.3 está `Completed`**, planejamento arquitetural
  concluído e aprovado via
  [ADR 008](docs/adr/008-runtime-persistence-and-repositories.md)
  (`Accepted`), executada em oito subtarefas, todas `Completed` e
  aprovadas: **3.3.1** — `RuntimeConfigModule` (único módulo global,
  fornece `SERVER_CONFIG`), `RedisModule` (estático, não-global) e
  `RedisService` (composição sobre `ioredis@6.0.0`, conexão lazy);
  **3.3.2** — `PrismaModule` (estático, não-global) e `PrismaService`
  (estende o `PrismaClient` gerado, injeta `SERVER_CONFIG`, constrói
  `PrismaPg` exclusivamente com `config.databaseUrl`, conexão
  exclusivamente lazy); **3.3.3** — composição offline do `AppModule`,
  com prova de instância única de `PrismaService`/`RedisService` no
  grafo Nest (ADR 008 §7.2/§8); **3.3.4** — harness de infraestrutura
  real (`apps/api/test/infra/`, target `api:test:integration:infra`,
  comando raiz `yarn validate:infra`); **3.3.5** — `UserRepository`/
  `UsersModule`; **3.3.6** — `WorkspaceRepository`/`WorkspacesModule`;
  **3.3.7** — `PropertyRepository`/`PropertiesModule` (commit
  `9e0a1dc`); **3.3.8** — validação integrada e fechamento documental,
  sem nenhum achado. **168 testes unitários, 44 testes de integração
  offline e 52 testes de integração com infraestrutura real confirmados
  ao final da 3.3.8.** **A Tarefa 3.4 está `Completed` e aprovada
  tecnicamente**: `GET /api/v1/health/ready` agora checa PostgreSQL/
  PostGIS e Redis de verdade, com `200`/`checks` quando saudável e
  `503`/`SERVICE_UNAVAILABLE` (sem `checks`) na falha de qualquer
  dependência; `GET /api/v1/health/live` permanece independente.
  **180 testes unitários, 49 testes de integração offline e 53 testes
  de integração com infraestrutura real confirmados ao final da 3.4**,
  incluindo validação operacional manual de parada/recuperação
  individual de `redis`/`postgres`. **A Tarefa 3.5 está `Completed` e
  aprovada tecnicamente**: [apps/api/Dockerfile](apps/api/Dockerfile)
  multi-stage (`node:24.18.0-bookworm-slim`, Yarn `4.12.0` fixados),
  usuário não-root, sem depender de `node_modules`/arquivos do host,
  `CMD` iniciando somente `node dist/apps/api/src/main.js` (sem
  migration automática), com [.dockerignore](.dockerignore)
  correspondente. Validado: build real da imagem, API iniciando a
  partir dela com liveness/readiness `200` contra o `postgres`/`redis`
  locais já existentes, ausência de `prisma.test.config.ts` e de fonte
  TypeScript na imagem, e `migrate deploy` explícito rodado dentro da
  imagem somente contra `mockp_test` (idempotente). A Tarefa 3.6
  continua bloqueada — só inicia com autorização própria.
- Repositório com workspace Yarn/Nx configurado, o skeleton técnico da
  API NestJS implementado, PostgreSQL/PostGIS + Redis disponíveis via
  Docker Compose, Prisma (schema, migration inicial e seed da fundação
  multi-tenant da ADR 007) implementado e validado, e a integração
  runtime da API com Prisma/Redis mais os repositories por agregado
  (`UserRepository`, `WorkspaceRepository`, `PropertyRepository`) já
  implementados, com readiness real desde a Tarefa 3.4 e Dockerfile da
  API validado desde a Tarefa 3.5 — ainda sem Next.js ou libs de
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
