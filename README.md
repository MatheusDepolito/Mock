# Mockp

Mockp é uma plataforma imobiliária que conecta clientes, corretores e
corretoras.

O workspace Yarn/Nx, `libs/config` e o skeleton técnico da API NestJS
(`apps/api`) já estão implementados (Fases 0 a 2, `Completed`). A Fase 3
(persistência e infraestrutura local) está **`Completed`**. **A Fase 4
(worker e BullMQ) está `Completed`** — última fase concluída; nenhuma
fase está `In Progress` e a Fase 5 (OpenAPI e api-client) está
`Pending`, não iniciada. As subtarefas 4.1 a 4.7 estão `Completed` e
aprovadas (`libs/queue`, `apps/worker` — com o consumidor ligado ao
seu `AppModule` e validado de ponta a ponta contra Redis real —, o
comando interno da API que publica `system.ping`, o Dockerfile do
worker com o ajuste do Dockerfile da API, e a validação integrada com
fechamento documental). Ver
[docs/IMPLEMENTATION_ROADMAP.md](docs/IMPLEMENTATION_ROADMAP.md), Fase
4, para o detalhamento. A especificação técnica
(Tarefa 3.0), o Docker Compose com PostGIS e
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
`mockp_test`. **A Tarefa 3.6** (validação integrada e fechamento
documental) está **`Completed` e aprovada tecnicamente**: checklist de
ponta a ponta da Fase 3 aprovado sem nenhum item pendente — provas
novas desta rodada (Compose saudável, rebuild reprodutível da imagem,
container novo com liveness/readiness `200`, `migrate deploy`/seed
idempotentes contra `mockp_test`, índice GiST e as 15 tabelas da ADR
007 confirmados) somadas a provas históricas reaproveitadas, não
repetidas (migration em banco limpo da 3.2; queda real de
PostgreSQL/Redis da 3.4). A ADR 006 contém referências históricas a um
catálogo de **4 papéis globais**, superseded pela ADR 007 — o seed
atual, com **2 papéis** (`CUSTOMER`/`ADMIN`), é o que está correto; a
ADR 006 não foi alterada. **A Fase 3 — Docker, PostGIS, Redis e Prisma
— está `Completed`**. **A Fase 4 — Worker e BullMQ — está
`Completed`**: `apps/worker` já existe e já consome `system.ping` de
verdade (subtarefas 4.1 a 4.3, mais o wiring de `SystemPingModule` a
`AppModule.forRoot()` na 4.5), o comando interno da API que publica
`system.ping` já existe (subtarefa 4.4) — sem nenhum endpoint HTTP
para esse fluxo — e um teste de ponta a ponta real (API → Redis →
worker), mais uma prova separada de retry/backoff, confirmam o fluxo
completo contra o Compose local (subtarefa 4.5, `Completed`). O
Dockerfile do worker ([apps/worker/Dockerfile](apps/worker/Dockerfile))
existe desde a Tarefa 4.6 (`Completed`): consumo real de `system.ping`
no container e `SIGTERM` real em Linux (saída `0` em 478 ms, sem
`SIGKILL`) comprovados; o Dockerfile da API foi ajustado na 4.6-A para
o grafo atual de quatro workspaces (incluindo `@mockp/queue`). A
Tarefa 4.7 repetiu a validação integrada e fechou a fase. Nenhum
Dockerfile de frontend existe ainda. Antes de qualquer novo scaffold ou
implementação, leia a documentação abaixo — ela é a fonte de verdade
do projeto.

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
- **Última fase concluída antes da corrente**: Fase 3 — Docker,
  PostGIS, Redis e Prisma — **`Completed`**. As Tarefas
  3.0 (abertura documental e especificação
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
  imagem somente contra `mockp_test` (idempotente). **A Tarefa 3.6 está
  `Completed` e aprovada tecnicamente**: checklist de ponta a ponta da
  Fase 3 aprovado sem nenhum item pendente — provas novas desta rodada
  (`postgres`/`redis` saudáveis sem reinício, rebuild reprodutível da
  imagem, container novo com `200`/liveness/readiness, usuário não-root
  e ausência de migration automática reconfirmados, `migrate deploy`/
  seed idempotentes contra `mockp_test`, índice GiST em
  `addresses.location` e as 15 tabelas da ADR 007 confirmados via
  consulta direta, `yarn validate`/`yarn validate:infra` reaprovados)
  somadas a provas históricas reaproveitadas, não repetidas (migration
  em banco limpo da Tarefa 3.2; queda real de PostgreSQL/Redis da
  Tarefa 3.4). **Divergência histórica sinalizada**: a ADR 006 registra
  um catálogo original de 4 papéis globais, parte da modelagem que a
  ADR 007 supersede — o seed atual, com 2 papéis (`CUSTOMER`/`ADMIN`),
  reflete a ADR 007 e está correto; a ADR 006 não foi alterada,
  permanece `Accepted`. **A Fase 3 — Docker, PostGIS, Redis e Prisma —
  está `Completed`**.
- **Fase corrente**: Fase 4 — Worker e BullMQ — **`Completed`** (última
  fase concluída; nenhuma fase `In Progress`; a Fase 5 está `Pending`,
  sem nenhuma implementação iniciada). As
  subtarefas **4.1** (`libs/queue` — `SYSTEM_QUEUE_NAME`,
  `SYSTEM_PING_JOB_NAME`, `SYSTEM_PING_JOB_OPTIONS`,
  `SystemPingJobPayload` — e o novo entrypoint `@mockp/config/worker`;
  versões exatas fixadas: `bullmq@6.3.9`, `@nestjs/bullmq@12.0.0`,
  `ioredis@6.0.0`), **4.2** (skeleton de `apps/worker`, hand-authored,
  `NestFactory.createApplicationContext`, sem `app.listen()`) e **4.3**
  (conexão `ioredis` própria do worker — `maxRetriesPerRequest: null`,
  nunca `RedisService` — e `SystemPingProcessor` via `@nestjs/bullmq`)
  estão **`Completed`** e aprovadas. **A subtarefa 4.4** (comando
  interno da API que publica `system.ping`, `apps/api/src/queue/**`,
  alvo Nx `queue:smoke:system-ping`, nunca um endpoint HTTP) também
  está **`Completed`** e aprovada, validada com Redis real do Compose
  local: exatamente um job por execução, payload (`requestId`/
  `publishedAt`) e opções (`attempts: 3`, backoff exponencial de
  `1000`ms) confirmados por inspeção direta do Redis e pelo log
  estruturado real, saída do processo em prazo finito sem
  `process.exit()`. **A subtarefa 4.5 (teste de ponta a ponta em
  `yarn validate:infra`) está `Completed` e aprovada tecnicamente**:
  `SystemPingModule` agora está importado em `AppModule.forRoot()` do
  worker (o `setInterval` interino da 4.2 foi removido); o logging do
  `SystemPingProcessor` foi corrigido para a chamada objeto-primeiro
  (sem serializar `Error` bruto no caminho de erro); um
  `QueueRedisConnectionCloser` próprio do worker fecha de verdade a
  conexão `ioredis` no shutdown (provado por `status === 'end'`, não só
  por `app.close()` resolver). Um teste E2E real publica via
  `SystemPingPublisher`, um worker real consome via Redis do Compose, e
  confirma payload/`requestId`/estado `completed` — isolado num banco
  lógico Redis dedicado (reservado por convenção, não por garantia
  técnica), com uma verificação somente leitura e fail-closed antes de
  iniciar o worker (recusa rodar se já houver job pendente, sem
  processar nem remover nada de terceiros). Uma prova separada
  confirma retry/backoff com fila e worker exclusivos do teste, nunca
  a fila `system`, comparando os atrasos medidos contra o valor exato
  da fórmula de backoff exponencial do BullMQ. `yarn validate`
  permanece 100% offline; `yarn validate:infra` cobre os dois testes
  reais novos. Dois riscos residuais foram registrados à época, documentados no
  roadmap: isolamento por convenção (não ACL) entre bancos lógicos do
  Redis (segue valendo), e a prova de `SIGTERM` real em
  Linux/container, **entregue depois pela Tarefa 4.6** (`Completed`:
  4.6-A ajusta o Dockerfile da API para os quatro workspaces e
  `@mockp/queue`; 4.6-B cria o Dockerfile do worker, com consumo real
  de `system.ping` e `SIGTERM` em Linux com saída `0` em 478 ms, sem
  `--init` nem `SIGKILL`; o `node_modules` completo inclui pacotes
  Prisma inertes, sem import/acesso a banco pelo worker; a imagem de
  teste foi mantida; a divergência factual da ADR 006 foi apenas
  reportada). **A subtarefa 4.7 (validação integrada e fechamento
  documental) está `Completed`**: evidências novas desta rodada —
  `yarn validate` com cache do Nx desligado, `yarn validate:infra`
  (55 testes na API e 2 no worker), ciclo completo de imagens com tags
  novas, consumo real de `system.ping` no container e `SIGTERM` real em
  Linux com saída `0` em 488 ms, sem `--init` nem `SIGKILL`, além de
  `migrate deploy` repetido após verificação sanitizada de que a
  conexão real aponta para `mockp_test` no `postgres` do Compose; as
  provas da 4.2, 4.5, 3.2 e 3.4 (SIGTERM no Windows, job decoy, banco
  limpo, queda de dependências) são históricas, reaproveitadas, não
  repetidas. A fase comprovou o `requestId` do comando interno até o
  log do worker — **não** a propagação de `X-Request-Id` de uma
  requisição HTTP até um job (nenhum endpoint HTTP enfileira jobs).
  Riscos residuais: isolamento por banco lógico convencional;
  `host.docker.internal` só no Docker Desktop; grafo de workspaces
  duplicado nos dois Dockerfiles; imagens grandes com pacotes Prisma
  inertes no worker; Dockerfile do worker não exercitado no Compose
  `full` (Fase 9); divergência factual da ADR 006 só reportada, sem
  alteração. Ver
  [docs/IMPLEMENTATION_ROADMAP.md](docs/IMPLEMENTATION_ROADMAP.md),
  Fase 4, para o detalhamento completo.
- Repositório com workspace Yarn/Nx configurado, o skeleton técnico da
  API NestJS implementado, PostgreSQL/PostGIS + Redis disponíveis via
  Docker Compose, Prisma (schema, migration inicial e seed da fundação
  multi-tenant da ADR 007) implementado e validado, e a integração
  runtime da API com Prisma/Redis mais os repositories por agregado
  (`UserRepository`, `WorkspaceRepository`, `PropertyRepository`) já
  implementados, com readiness real desde a Tarefa 3.4 e Dockerfile da
  API validado desde a Tarefa 3.5; `apps/worker` e `libs/queue` já
  existem e o worker já consome `system.ping` de verdade, validado
  contra Redis real (Fase 4, `Completed`); `apps/worker/Dockerfile`
  existe e foi validado na Tarefa 4.6 (`Completed`) — ainda sem
  Next.js e sem libs de produto além de `libs/config`/`libs/queue`; a
  Fase 5 permanece `Pending`.
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
