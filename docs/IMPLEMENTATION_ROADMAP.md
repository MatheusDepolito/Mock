# Roadmap de implementação

Este documento divide a construção do skeleton técnico do Mockp em fases
pequenas e sequenciais. **As fases devem ser executadas uma de cada vez,
na ordem descrita.** Não é permitido implementar múltiplas fases
simultaneamente, nem antecipar entregáveis de uma fase futura durante
uma fase anterior, sem autorização explícita do responsável pelo
projeto.

Cada fase só é considerada iniciada após a fase anterior atender a seus
critérios de aceite.

## Controle de status das fases

Cada fase tem um campo **Status**, com um dos valores:

- `Pending` — ainda não iniciada.
- `In Progress` — em execução no momento.
- `Completed` — concluída e validada.
- `Blocked` — iniciada mas impedida de prosseguir (a razão do bloqueio
  deve ser registrada na própria fase).

Regras de controle:

- **Somente uma fase pode estar `In Progress`** por vez em todo o
  roadmap.
- A Fase 0 só pode ser marcada como `Completed` após a aprovação final
  da revisão documental pelo responsável pelo projeto — não
  automaticamente ao final de uma tarefa de edição de documentação.
- O [README.md](../README.md) deve sempre mostrar a fase corrente
  (a que está `In Progress`, ou a última `Completed` se nenhuma
  estiver `In Progress`).
- Ao concluir uma fase, o README.md e este roadmap devem ser
  atualizados **na mesma alteração** (mesmo commit/tarefa), nunca em
  momentos separados.
- Nenhuma fase futura pode ser antecipada sem autorização explícita do
  responsável pelo projeto, mesmo que o status permita tecnicamente.

## Fase corrente

**Fase 5 — OpenAPI e api-client**: `In Progress` — subtarefas 5.0
(abertura documental), 5.1 (spike), 5.2 (scaffold de `libs/api-client`
e dependências), 5.3 (Dockerfiles e o quinto workspace) e 5.4 (extração
do setup HTTP e do documento Swagger) e 5.5 (documentação de Problem
Details, headers e `operationId`s) `Completed`; 5.6 a 5.12 `Pending`.
Ver seção própria da Fase 5 abaixo.

**Fase 4 — Worker e BullMQ**: `Completed` — última fase concluída antes
da corrente (4.1 a 4.7 `Completed` e aprovadas; ver seção própria da
Fase 4 abaixo).

**Fase 3 — Docker, PostGIS, Redis e Prisma**: `Completed` — anterior
à Fase 4, que também está `Completed`. As
Tarefas 3.0 (abertura documental e especificação técnica), 3.1 (Docker
Compose com PostGIS e Redis) e **3.2** (Prisma, schema, migration
inicial e seed) estão **`Completed`** e aprovadas —
[ADR 006](adr/006-persistence-and-local-infrastructure.md) e
[ADR 007](adr/007-multi-tenant-workspace-foundation.md) estão ambas
`Accepted` (ADR 007 supersede **exclusivamente a modelagem de dados**
da ADR 006, seção "Entidades permitidas" em diante; as decisões de
infraestrutura local e pipeline da ADR 006 — Docker Compose, Redis,
separação de configs Prisma, `yarn validate` — continuam válidas).
`docker-compose.yml` sobe `postgres` (`postgis/postgis:18-3.6`) e
`redis` (`redis:8.8.2-alpine`), com os bancos `mockp` e `mockp_test`,
healthchecks e volumes nomeados separados; `DATABASE_URL`/`REDIS_URL`
são obrigatórias no `ServerConfig`, e `TEST_DATABASE_URL` é exclusiva
de testes/scripts. `schema.prisma`, a migration inicial e o seed
**implementam as 15 entidades multi-tenant da ADR 007**, validados
offline e em banco limpo (volume PostgreSQL recriado, migration
aplicada em `mockp` e `mockp_test`, seed idempotente, 15 tabelas +
`_prisma_migrations`, **23 `CHECK`s do domínio Mockp** — 24 no total
do schema `public`, incluindo `spatial_ref_sys_srid_check`, que
pertence à extensão PostGIS, não ao domínio —, 17 FKs, índices e
extensões confirmados, provas negativas/positivas em transação com
rollback) — auditoria independente aprovou o resultado. **A Tarefa 3.3
está `Completed`**. O planejamento arquitetural está **concluído e
aprovado**: [ADR 008](adr/008-runtime-persistence-and-repositories.md)
está `Accepted`. A Tarefa 3.3 foi executada subtarefa por subtarefa
(oito no total, ADR 008 §8). **As subtarefas 3.3.1 a 3.3.6 estão
`Completed` e aprovadas**: **3.3.1** — `RuntimeConfigModule`,
`RedisModule` e `RedisService` (integração com o Redis exclusivamente
lazy, nenhum teste offline abre socket real); **3.3.2** —
`PrismaModule` e `PrismaService` (conexão com o Prisma exclusivamente
lazy, nenhum `$connect()` eager, nenhuma query no bootstrap,
`onModuleDestroy()` aguarda `$disconnect()`, nenhum teste offline abre
conexão PostgreSQL real); **3.3.3** — composição offline do
`AppModule`, com prova de instância única de `PrismaService`/
`RedisService` no grafo Nest, conforme ADR 008 §7.2/§8; **3.3.4** —
harness de infraestrutura real (`apps/api/test/infra/`, target
`api:test:integration:infra`, comando raiz `yarn validate:infra`,
conforme ADR 008 §7.3/§7.5) e os primeiros testes reais contra
PostgreSQL/PostGIS e Redis; **3.3.5** — `UserRepository`
(`createWithCredential`/`createWithAuthIdentity`/`findById`/
`findByEmail`, ADR 008 §4.1) e `UsersModule`; **3.3.6** —
`WorkspaceRepository` (`createIndividualWorkspace`/
`createBrokerageWorkspace`, ambos totalmente atômicos em uma única
transação, mais `findById`, ADR 008 §4.2) e `WorkspacesModule`. Todos
já existem no código e já estão importados em `AppModule`. Até aqui,
nenhum dos dois (Prisma/Redis) representava readiness real por si só —
isso passou a ser exclusivamente a Tarefa 3.4 (ver fechamento abaixo);
até este ponto da 3.3, nenhum Dockerfile da API existia ainda — isso
passou a ser exclusivamente a Tarefa 3.5 (ver fechamento abaixo; não é
mais o estado atual). **A subtarefa 3.3.7**
(`PropertyRepository`/`PropertiesModule`, ADR 008 §4.3) está
**`Completed` e aprovada** — implementada e commitada isoladamente
(`9e0a1dc`). **A subtarefa 3.3.8** (validação integrada e fechamento
documental) está **`Completed` e aprovada** — `yarn validate` e
`yarn validate:infra` aprovados de ponta a ponta, sem nenhum achado.
**168 testes unitários, 44 testes de integração offline e 52 testes de
integração com infraestrutura real confirmados ao final da 3.3.8.**
**A Tarefa 3.3 está `Completed`.** **A Tarefa 3.4** (readiness real e
testes de falha das dependências) está **`Completed` e aprovada
tecnicamente**: `GET /api/v1/health/ready` agora checa PostgreSQL/
PostGIS (via `PrismaService`, transação com `set_config('statement_timeout',
..., true)` parametrizado seguido de `PostGIS_Version()`) e Redis (via
`RedisService.ping()`) — `200` com `checks: { application: 'up',
database: 'up', redis: 'up' }` quando saudável; `503` em Problem
Details, `code: SERVICE_UNAVAILABLE`, sem `checks`, na falha de
qualquer dependência. `GET /api/v1/health/live` permanece
independente. **180 testes unitários, 49 testes de integração offline e
53 testes de integração com infraestrutura real confirmados ao final da
3.4**, incluindo um teste real do `set_config` parametrizado e
validação operacional manual (parada/recuperação individual de
`redis`/`postgres`, com `503`/`200` e liveness `200` confirmados; ambos
os containers restaurados saudáveis). Risco residual aceito: o timeout
do probe não cancela necessariamente uma tentativa física de conexão
PostgreSQL ainda pendente em falha extrema de rede; a configuração
compartilhada do `PrismaService` não foi alterada. **A Tarefa 3.5**
(Dockerfile da API) está **`Completed` e aprovada tecnicamente**:
`apps/api/Dockerfile` multi-stage (imagem-base e Yarn fixados nos dois
stages, conforme ADR 006, "Dockerfile da API e Prisma"), usuário
não-root no stage final, sem depender de `node_modules`/arquivos do
host, `CMD` iniciando somente `node dist/apps/api/src/main.js` (sem
migration automática), com `.dockerignore` correspondente. Validado:
`yarn validate` aprovado; build real da imagem a partir da raiz do
monorepo; API iniciando a partir da imagem com
`GET /api/v1/health/live`/`GET /api/v1/health/ready` respondendo `200`
contra o `postgres`/`redis` locais já existentes (sem pará-los ou
recriá-los); usuário não-root confirmado; ausência de
`prisma.test.config.ts` e de qualquer fonte TypeScript não compilado na
imagem confirmada; ausência de migration automática no boot confirmada
via `/proc/1/cmdline`; comando explícito
`yarn workspace api prisma migrate deploy --config prisma.migrate.config.ts`
executado dentro da imagem exclusivamente contra `mockp_test` (host e
nome do banco confirmados antes), de forma idempotente (`No pending
migrations to apply`); container de teste encerrado ao final, sem
alterar o profile `full` do Compose. Duas lacunas factuais da ADR 006
foram corrigidas durante a validação (a decisão em si não mudou): o
caminho real do `CMD` é `dist/apps/api/src/main.js`, e o cache do
Corepack precisou de `COREPACK_HOME` fixo e de `/app` com posse
ajustada para o usuário `node`, para que nenhuma chamada de rede nem
erro de permissão ocorresse em runtime. **A Tarefa 3.6** (validação
integrada e fechamento documental) está **`Completed` e aprovada
tecnicamente**: checklist de ponta a ponta da Fase 3 aprovado sem
nenhum item pendente ou bloqueado. **Provas novas desta rodada**:
`postgres`/`redis` saudáveis via `docker compose ps`, sem parar ou
reiniciar nenhum dos dois; imagem de `apps/api` reconstruída a partir
da raiz do monorepo (manifest idêntico ao build da 3.5 — build
reprodutível) e iniciada em um container novo e temporário, com
liveness/readiness `200`, usuário `node` e ausência de migration
automática (`/proc/1/cmdline`) reconfirmados;
`db:migrate:deploy:test`/`db:seed:test` executados contra `mockp_test`
de forma idempotente (`No pending migrations to apply` / `Seed
complete: 2 role(s) in the catalog`); índice GiST em
`addresses.location` confirmado via `pg_indexes`; as 15 tabelas de
domínio da ADR 007 confirmadas em `mockp_test` via `\dt`; `yarn
validate` e `yarn validate:infra` reaprovados de ponta a ponta (mesmas
contagens da 3.4). O container de teste foi encerrado ao final; nenhum
volume foi recriado, nenhuma dependência foi parada manualmente nesta
rodada, e o profile `full` não foi executado. **Provas históricas
reaproveitadas, não repetidas**: migration em banco limpo (Tarefa 3.2)
e a queda real de PostgreSQL/Redis fazendo o readiness responder `503`
(Tarefa 3.4, validação operacional manual). **Divergência histórica
sinalizada, não corrigida na ADR 006**: a ADR 006 registra um catálogo
original de 4 papéis globais (`RoleName { CUSTOMER AGENT MANAGER
ADMIN }`), parte da modelagem de dados que a ADR 007 supersede
explicitamente — o seed atual, com 2 papéis globais (`CUSTOMER`,
`ADMIN`), está correto e reflete a ADR 007; as menções a "4 papéis" na
ADR 006 são registro histórico, não o contrato atual, e a ADR 006 não
foi alterada nesta rodada, permanece `Accepted`. **A Tarefa 3.6 está
`Completed`. A Fase 3 — Docker, PostGIS, Redis e Prisma — está
`Completed`**. As Fases 0, 1 e 2 também estão `Completed`. **A Fase 4 —
Worker e BullMQ — está `Completed`**: as subtarefas 4.1 a 4.7 estão
`Completed` e aprovadas. **A Fase 5 — OpenAPI e api-client — está
`In Progress`** (ver sua seção própria). Ver a seção própria da Fase 4
para o detalhamento.

---

## Fase 0 — Fundação e revisão documental

**Status**: Completed — a revisão documental foi aprovada pelo
responsável pelo projeto.

**Objetivo**: estabelecer e manter atualizada a fonte de verdade de
produto e arquitetura antes de qualquer código.

**Entregáveis**:

- README.md, AGENTS.md.
- docs/PRODUCT_CONTEXT.md, docs/TARGET_ARCHITECTURE.md,
  docs/REFERENCE_REPOSITORY.md, docs/IMPLEMENTATION_ROADMAP.md.
- ADRs 001 a 004 em docs/adr/.
- Identificação do repositório de referência
  (`C:\dev\mockp\Mockp`, ver [docs/REFERENCE_REPOSITORY.md](REFERENCE_REPOSITORY.md)).

**Validações**:

- Revisão humana do conteúdo documental (consistência entre documentos).
- Nenhum arquivo de código, configuração executável ou dependência
  presente no repositório.

**Critérios de aceite**:

- Todos os documentos listados existem, não se contradizem, e refletem
  as decisões aprovadas (Stripe/Mapbox em sandbox, Docker profiles,
  ordem de fases sem dependência circular, contrato de erro,
  correlation ID, health checks e rate limiting, `system.ping` sem
  endpoint público, propriedade dos design tokens em `libs/ui`,
  `libs/config` com entrypoints separados, modelo de dados
  esclarecido).
- Este roadmap está referenciado a partir do README.md, e o README.md
  mostra a fase corrente.
- Aprovação final da revisão documental concedida pelo responsável pelo
  projeto ao autorizar o início da Fase 1.

---

## Fase 1 — Yarn 4 e Nx (bootstrap do monorepo)

**Status**: Completed — aprovada tecnicamente pelo responsável pelo
projeto.

**Objetivo**: preparar o ambiente de workspace sem ainda gerar código de
aplicação.

**Entregáveis**:

- Configuração do Yarn 4 (`.yarnrc.yml`, `packageManager`).
- Workspace Nx inicializado, sem apps ou libs de negócio ainda.
- Configuração base de TypeScript strict, lint e formatação para o
  monorepo.

**Validações**:

- `yarn install` executa sem erros.
- `yarn nx show projects` executa sem erros (lista vazia é aceitável).
- `yarn nx report` executa sem erros e reporta as versões do
  workspace.
- Typecheck da configuração base (`tsconfig` raiz) sem erros.
- Lint dos arquivos de configuração suportados (ex.: arquivos de
  configuração do Nx, do TypeScript e do lint em si) sem erros.
- `format:check` sem erros.

`nx graph` (modo interativo) não é usado como critério obrigatório de
validação desta fase — é apenas uma ferramenta de inspeção manual
opcional.

**Critérios de aceite**:

- Estrutura de workspace criada conforme
  [docs/TARGET_ARCHITECTURE.md](TARGET_ARCHITECTURE.md), sem nenhuma
  lógica de aplicação ainda.

---

## Fase 2 — API NestJS (skeleton da API)

**Status**: Completed — implementação concluída e revisão técnica
aprovada pelo responsável pelo projeto.

**Objetivo**: ter a API NestJS operacional com as convenções técnicas
obrigatórias, sem endpoints de negócio.

**Entregáveis**:

- App `apps/api` com NestJS, prefixo `/api` e versionamento `/v1`.
- `GET /api/v1/health/live` (confirma somente que o processo está
  vivo) e `GET /api/v1/health/ready` (nesta fase, antes de existir
  qualquer infraestrutura externa, confirma somente a inicialização da
  aplicação — passa a checar PostgreSQL/PostGIS e Redis a partir da
  Fase 3).
- Swagger UI em `/docs` e OpenAPI JSON em `/docs-json`.
- `ValidationPipe` global (`transform: true`, `whitelist: true`,
  `forbidNonWhitelisted: true`).
- RFC Problem Details para erros (campos `type`, `title`, `status`,
  `detail`, `instance`, `code`, `requestId`, `errors` opcional; content
  type `application/problem+json`), incluindo o catálogo mínimo do
  skeleton (`VALIDATION_ERROR`, `INTERNAL_SERVER_ERROR`,
  `RATE_LIMIT_EXCEEDED`, `SERVICE_UNAVAILABLE`, `NOT_FOUND`) — ver
  [docs/TARGET_ARCHITECTURE.md](TARGET_ARCHITECTURE.md), seção 4.
- Correlation ID via header `X-Request-Id` (gerado, validado, ecoado na
  resposta e refletido em `requestId`) — ver
  [docs/TARGET_ARCHITECTURE.md](TARGET_ARCHITECTURE.md), seção 4.
- Logging estruturado, Helmet, CORS por allowlist, rate limiting
  (com liveness, readiness, Swagger UI e `/docs-json` isentos), graceful
  shutdown.
- Adaptador HTTP Express e logger Pino (`nestjs-pino`), conforme
  [ADR 005](adr/005-api-runtime.md).
- `libs/config` (`@mockp/config`) criada com o entrypoint server-only
  (`@mockp/config/server`), validando o ambiente da API com Zod —
  entrypoint client-safe fica para a Fase 7.

**Validações**:

- API sobe localmente (`nx serve api`) sem banco de dados configurado
  ainda; `GET /api/v1/health/ready` responde de forma coerente
  verificando apenas a inicialização da aplicação nesta fase.
- Swagger UI acessível e OpenAPI JSON válido.
- Requisição inválida retorna erro no formato Problem Details completo,
  com `application/problem+json`, `code: VALIDATION_ERROR` e `errors`
  no formato `Record<string, string[]>`.
- Header `X-Request-Id` enviado pelo cliente é reutilizado quando
  válido; valores ausentes ou inválidos são substituídos por um UUID
  gerado pela API.
- Chamadas repetidas a `/api/v1/health/live`, `/api/v1/health/ready`,
  `/docs` e `/docs-json` não são bloqueadas pelo rate limiting; demais
  endpoints seguem a política global.

**Critérios de aceite**:

- Todas as convenções da seção 4 de
  [docs/TARGET_ARCHITECTURE.md](TARGET_ARCHITECTURE.md) implementadas
  exatamente como documentado.
- Nenhuma regra de camada (Controller/Service/Repository) violada, ainda
  que não existam domínios de negócio nesta fase.

---

## Fase 3 — Docker, PostGIS, Redis e Prisma

**Status**: Completed — anterior à Fase 4, que também está
`Completed` (ver seção própria). Tarefa 3.0 (abertura
documental e especificação técnica), Tarefa 3.1 (Docker Compose com
PostGIS e Redis) e **Tarefa 3.2** (Prisma, schema, migration inicial e seed)
**concluídas e aprovadas** via
[ADR 006](adr/006-persistence-and-local-infrastructure.md) e
[ADR 007](adr/007-multi-tenant-workspace-foundation.md) (ambas
`Accepted` — ADR 007 supersede **exclusivamente a modelagem de dados**
da ADR 006; as decisões de infraestrutura/pipeline da ADR 006
continuam válidas). A infraestrutura local já existe:
`docker-compose.yml` com os serviços `postgres`
(`postgis/postgis:18-3.6`) e `redis` (`redis:8.8.2-alpine`), sem
`container_name`/`profiles`, healthchecks, volumes nomeados separados,
bancos `mockp` e `mockp_test` criados deterministicamente;
`DATABASE_URL`/`REDIS_URL` obrigatórias no `ServerConfig`,
`TEST_DATABASE_URL` exclusiva de testes/scripts. `schema.prisma`, a
migration inicial e o seed **implementam as 15 entidades multi-tenant
da ADR 007**, validados offline e em banco limpo — auditoria
independente aprovou o resultado (ver "3.2" abaixo). Até o final da
Tarefa 3.2, nenhum Dockerfile da API havia sido criado ainda — isso não
é mais o estado atual (ver "3.5" abaixo). **A Tarefa 3.3 está
`Completed`**.
Planejamento arquitetural **concluído e aprovado**:
[ADR 008](adr/008-runtime-persistence-and-repositories.md) está
`Accepted`. **As subtarefas 3.3.1 a 3.3.6 estão `Completed` e
aprovadas** — ver "3.3" abaixo para o detalhamento de cada uma. **A
subtarefa 3.3.7** (`PropertyRepository`/`PropertiesModule`) está
**`Completed` e aprovada** — implementada e commitada isoladamente
(`9e0a1dc`). **A subtarefa 3.3.8** (validação integrada e fechamento
documental) está **`Completed` e aprovada**. **A Tarefa 3.4**
(readiness real e testes de falha das dependências) está **`Completed`
e aprovada tecnicamente** — `GET /api/v1/health/ready` já checa
PostgreSQL/PostGIS e Redis de verdade (ver "3.4" abaixo para o
detalhamento). **A Tarefa 3.5** (Dockerfile da API) está **`Completed`
e aprovada tecnicamente** — `apps/api/Dockerfile` já existe, builda com
sucesso e a API já inicia a partir da imagem gerada (ver "3.5" abaixo
para o detalhamento). **A Tarefa 3.6** (validação integrada e
fechamento documental) está **`Completed` e aprovada tecnicamente** —
checklist de ponta a ponta da Fase 3 aprovado sem nenhum item pendente
(ver "3.6" abaixo para o detalhamento). **A Fase 3 está `Completed`.**

**Objetivo**: provisionar a infraestrutura local (profile padrão) e
modelar o núcleo de dados inicial.

**Subtarefas**:

- **3.1 — Docker Compose com PostGIS e Redis**: criar
  `docker-compose.yml` (profile padrão) com os serviços PostgreSQL/
  PostGIS e Redis conforme a ADR 006 (imagens fixadas, sem
  `container_name`, sem `profiles`, health checks, volumes nomeados
  separados); adicionar `DATABASE_URL`/`REDIS_URL` ao `.env.example`
  (valores locais não secretos) e ao schema Zod server-only.
- **3.2 — Prisma, schema, migration inicial e seed**: Prisma `7.10.0` e
  seus arquivos de configuração (`prisma.config.ts`,
  `prisma.migrate.config.ts`, `prisma.test.config.ts`,
  `prisma/prisma-config.shared.ts`) **já foram criados**, sob a
  autoridade da [ADR 006](adr/006-persistence-and-local-infrastructure.md)
  para infraestrutura/Prisma-configuração/pipeline (inalterada). A
  modelagem de dados **já foi reimplementada** e validada, tanto
  offline quanto em banco limpo (Etapa B), para o schema final de 15
  entidades definido pela
  [ADR 007](adr/007-multi-tenant-workspace-foundation.md) (`Accepted`,
  autoridade da modelagem):
  - remoção de `BrokerageMembership`/`BrokerageMemberRole`,
    substituídos por `WorkspaceMembership`/`WorkspaceMembershipRole`;
  - `Workspace` como fronteira de tenant (`INDIVIDUAL`/`BROKERAGE`),
    com `WorkspaceAgent`;
  - UUIDv7 (`dbgenerated("uuidv7()")`) em toda entidade com ID não
    determinístico, **exceto `Role.id`** (catálogo versionado e
    determinístico, sem default, sempre explícito — ajuste aprovado
    após a primeira reimplementação);
  - `citext` para `email`/`slug`/`licenseNumber`/`jurisdictionCode`
    (`jurisdictionCode` ajustado após a primeira reimplementação);
  - `Address` com estrutura internacional completa (`addressLine1`
    obrigatório, `addressLine2`/`district` opcionais — ajuste aprovado
    após a primeira reimplementação);
  - PostGIS e índice GiST em `Address.location` (mantidos da ADR 006);
  - FKs compostas de isolamento de tenant;
  - índices auxiliares de FK em `AuthIdentity.userId`,
    `UserRole.roleId` e `AgentLicense.agentProfileId` (ajuste aprovado
    após a primeira reimplementação);
  - lifecycle explícito (`status`, timestamps, `version`) nas entidades
    aplicáveis;
  - `CHECK`s de coerência status/timestamp e de normalização de
    formato definidos pela ADR 007;
  - seed reduzido a `CUSTOMER` (`...001`) e `ADMIN` (`...004`);
  - migration inicial **reescrita do zero**, não incremental (nenhuma
    migration foi publicada/commitada em nenhum ambiente compartilhado
    antes desta aplicação).
  - **Etapa B concluída**: volume PostgreSQL recriado, migration
    aplicada via `db:migrate:deploy`/`db:migrate:deploy:test` em
    `mockp` e `mockp_test`, seed executado duas vezes em cada banco
    (idempotência confirmada), estrutura (15 tabelas + `_prisma_migrations`,
    **23 `CHECK`s do domínio Mockp** — 24 no total do schema `public`,
    contando `spatial_ref_sys_srid_check`, próprio da extensão
    PostGIS, não do domínio —, 17 FKs, índices tenant-scoped, GiST,
    `citext`) conferida em ambos, e provas negativas/positivas
    executadas em `mockp_test` dentro de uma transação com rollback
    (sem fixtures remanescentes). **`Completed`** — aprovada por
    auditoria independente (schema, migration, seed, provas em banco
    limpo, `yarn validate` com 34 testes de integração).
- **3.3 — `PrismaModule`, `RedisModule` e repositories por agregado**:
  `PrismaService`/`PrismaModule` (via `PrismaPg`), módulo de conexão
  Redis, e repositories orientados aos agregados do modelo da ADR 007
  — ex.: `UserRepository`, `WorkspaceRepository` (`Brokerage` é perfil
  exclusivo do agregado `Workspace`, não um agregado próprio) e
  `PropertyRepository` (`Address` pertence ao agregado `Property`).
  Toda operação tenant-scoped exige `workspaceId` explícito no
  repository. **`Completed`** (Tarefa 3.2 concluída). Planejamento
  arquitetural **concluído e aprovado**:
  [ADR 008](adr/008-runtime-persistence-and-repositories.md) está
  `Accepted`, incluindo `RuntimeConfigModule` (único módulo global),
  `PrismaModule`/`RedisModule` estáticos não-globais, conexões lazy,
  `RedisService` por composição, contratos dos repositories, CAS e
  locks, catálogo de erros internos, a antecipação de `validate:infra`
  para esta tarefa, e a substituição pontual da decisão de UUID raw de
  `Address` da ADR 006. Divisão em oito subtarefas (ADR 008 §8):
  - **3.3.1 — `RuntimeConfigModule` e `RedisModule`/`RedisService` +
    testes offline**: **`Completed`** — aprovada tecnicamente.
    `RuntimeConfigModule` (global, fornece `SERVER_CONFIG`),
    `RedisModule` (estático, não-global) e `RedisService` (composição
    sobre `ioredis@6.0.0`, conexão lazy, timeouts finitos, erros
    normalizados via `RedisUnavailableError`, shutdown seguro) já
    existem no código e já estão importados em `AppModule`. A
    integração com o Redis é **exclusivamente lazy** — nenhum teste
    offline abre socket real, e sua existência sozinha **não representava
    readiness real** (isso passou a ser coberto pela Tarefa 3.4,
    `Completed` — ver abaixo).
  - **3.3.2 — `PrismaModule`/`PrismaService` + testes offline**:
    **`Completed`** — aprovada tecnicamente. `PrismaService`
    (`@Injectable()`, estende o `PrismaClient` gerado localmente,
    implementa `OnModuleDestroy`) injeta `SERVER_CONFIG` e constrói
    `PrismaPg` usando exclusivamente `config.databaseUrl`; `PrismaModule`
    (estático, não-global, `providers`/`exports: [PrismaService]`) já
    existem no código e já estão importados em `AppModule`. **A conexão
    com o Prisma é exclusivamente lazy** — nenhum `OnModuleInit`,
    nenhum `$connect()` eager, nenhuma query durante o bootstrap,
    nenhum teste offline abre conexão PostgreSQL real;
    `onModuleDestroy()` aguarda (`await`) `this.$disconnect()`. Sua
    existência sozinha **não representava readiness real** (isso passou
    a ser coberto pela Tarefa 3.4, `Completed` — ver abaixo).
  - **3.3.3 — Composição offline do `AppModule`**: **`Completed`** —
    aprovada tecnicamente. Composição somente com módulos já
    funcionais — `RuntimeConfigModule` + `PrismaModule` + `RedisModule`
    já wired nas subtarefas 3.3.1–3.3.2, incluindo a prova de instância
    única de `PrismaService` e `RedisService` no grafo Nest, exatamente
    conforme ADR 008 §7.2/§8. Os 34 testes de integração offline
    existentes continuam verdes sem alteração de comportamento.
  - **3.3.4 — Harness de infraestrutura real + primeiros testes
    reais**: **`Completed`** — aprovada tecnicamente. Cria
    `apps/api/test/infra/` (config dedicado, target
    `api:test:integration:infra`, comando raiz `yarn validate:infra`,
    `TRUNCATE` guardado sobre as tabelas mutáveis, execução serial —
    ADR 008 §7.5), e os primeiros testes reais: `PrismaService`
    executando uma query real, `RedisService.ping()` real (só
    `connect`/`PING`, nenhuma escrita — ADR 008 §7.6).
  - **3.3.5 — `UserRepository`/`UsersModule`**: **`Completed`** —
    aprovada tecnicamente. Implementação completa (ADR 008 §4.1):
    `createWithCredential`, `createWithAuthIdentity`, `findById`,
    `findByEmail`, com a validação de `roleNames` (vazio → duplicata →
    existência no catálogo) antes de qualquer query, mais testes
    offline, reais (`DUPLICATE_EMAIL`/`DUPLICATE_AUTH_IDENTITY`) e de
    contrato de `AgentLicense`. `AppModule` passou a importar
    `UsersModule` nesta subtarefa.
  - **3.3.6 — `WorkspaceRepository`/`WorkspacesModule`**:
    **`Completed`** — aprovada tecnicamente. `createIndividualWorkspace`
    e `createBrokerageWorkspace` (ambos totalmente atômicos em uma
    única transação, ADR 008 §4.2), mais `findById`, com testes
    offline/reais (`OWNER_NOT_FOUND`, `AGENT_PROFILE_REQUIRED`,
    `DUPLICATE_WORKSPACE_SLUG`) e de contrato da FK composta
    `WorkspaceAgent` ↔ `WorkspaceMembership`. `AppModule` passou a
    importar `WorkspacesModule` nesta subtarefa.
    **Contagem confirmada ao final da 3.3.6**: 132 testes unitários, 44
    testes de integração offline e 23 testes de integração com
    infraestrutura real.
  - **3.3.7 — `PropertyRepository`/`PropertiesModule`** (ADR 008 §4.3):
    **`Completed`** — aprovada tecnicamente. Implementação completa:
    `createProperty` (guarda de formato + transação com `SELECT`/
    `FOR UPDATE` sobre `WorkspaceAgent`, `INSERT` de `Property` via
    Prisma Client e `INSERT` de `Address` via SQL raw parametrizado),
    `findByIdInWorkspace` e `updatePropertyStatus` (CAS via `UPDATE`/
    `WHERE version = $expected`, máquina de estados de timestamps
    conforme ADR 007), com testes offline, reais e de contrato para os
    `CHECK`s de formato/coerência e as FKs compostas de tenant. Commit
    isolado (`9e0a1dc`, 12 arquivos de código e testes), com revisão
    técnica final aprovada para commit antes da criação do commit.
  - **3.3.8 — Validação integrada e fechamento documental**:
    **`Completed`** — aprovada tecnicamente. Validação de ponta a ponta
    sem nenhum achado: HEAD e worktree limpo confirmados, `postgres`/
    `redis` saudáveis, suíte real apontando exclusivamente para
    `mockp_test`, `yarn validate` e `yarn validate:infra` aprovados,
    composição do `AppModule`, isolamento entre testes offline e reais,
    regras de camada (ADR 002) e ausência de alterações no contrato
    público confirmados, seguidos deste fechamento documental.
    **Contagem confirmada ao final da 3.3.8**: 168 testes unitários, 44
    testes de integração offline e 52 testes de integração com
    infraestrutura real. **A Tarefa 3.3 está `Completed`.**
- **3.4 — Readiness real e testes de falha das dependências**:
  **`Completed`** — aprovada tecnicamente. `GET /api/v1/health/ready`
  passou a checar PostgreSQL/PostGIS (via `PrismaService`, em uma
  transação com `set_config('statement_timeout', ..., true)`
  parametrizado seguido de `PostGIS_Version()`, validando que o
  resultado é uma string não vazia) e Redis (via `RedisService.ping()`,
  reaproveitado sem alteração), com as duas checagens iniciadas em
  paralelo e agregadas via `Promise.allSettled`. Saudável, responde
  `200` com `checks: { application: 'up', database: 'up', redis: 'up' }`;
  falha de qualquer dependência responde `503` em Problem Details,
  `code: SERVICE_UNAVAILABLE`, sem o campo `checks`, com `detail`
  estático identificando qual dependência falhou (nunca o erro bruto,
  `cause`, URL ou credenciais — inclusive nos logs, que registram só o
  nome lógico do check). `GET /api/v1/health/live` permanece
  independente de ambas. `HealthModule` passou a
  `imports: [PrismaModule, RedisModule]` (ADR 008 §2.4); nenhum
  Repository de infraestrutura foi criado, e a configuração
  compartilhada do `PrismaService` não foi alterada. Testes: unitários e
  de integração offline cobrindo sucesso, falha individual de cada
  dependência, resultado de PostGIS inválido, falha dupla, ausência de
  `checks` no `503`, correlation ID e isenção de rate limiting, todos
  com `PrismaService`/`RedisService` mockados via um novo hook
  `overrideProviders` em `create-test-app.ts` — `api:test:integration`
  continua 100% offline. Teste de integração real (`yarn validate:infra`)
  cobrindo o caminho feliz contra PostgreSQL/PostGIS e Redis reais,
  confirmando que a forma parametrizada de `set_config` funciona.
  **180 testes unitários, 49 testes de integração offline e 53 testes de
  integração com infraestrutura real confirmados ao final da 3.4.** Além
  dos testes automatizados, validação operacional manual autorizada
  separadamente confirmou, contra a API local: parar `redis` →
  `503`/`SERVICE_UNAVAILABLE` (`detail` identificando Redis) e liveness
  `200`; reiniciar `redis` → `200` novamente; parar `postgres` → mesmo
  padrão, `detail` identificando PostgreSQL; reiniciar `postgres` → `200`
  novamente — nunca os dois parados ao mesmo tempo, nunca
  `docker compose down`/`down -v`, ambos restaurados saudáveis ao final.
  **Risco residual aceito nesta tarefa**: o timeout do probe (`maxWait`/
  `statement_timeout`) garante um prazo finito de resposta, mas não
  cancela necessariamente uma tentativa física de conexão PostgreSQL
  ainda pendente em uma falha extrema de rede (fechar essa lacuna
  exigiria alterar a configuração compartilhada do `PrismaService`, o
  que não foi autorizado nesta tarefa).
- **3.5 — Dockerfile da API**: **`Completed`** — aprovada tecnicamente.
  `apps/api/Dockerfile` multi-stage (`build`/`runtime`), conforme
  [ADR 006](adr/006-persistence-and-local-infrastructure.md)
  ("Dockerfile da API e Prisma"): imagem-base fixada
  (`node:24.18.0-bookworm-slim`) e Yarn `4.12.0` (via Corepack) nos dois
  stages; contexto de build na raiz do monorepo; `HUSKY=0` no
  `yarn install --immutable`; Prisma Client gerado e API compilada via
  `yarn nx run api:build`, sem exigir `DATABASE_URL` no build; stage
  final rodando como usuário não-root (`node`), sem depender de
  `node_modules`/arquivos do host, com a lista mínima de arquivos Prisma
  da ADR 006 (nunca `prisma.test.config.ts` nem testes); `CMD` iniciando
  somente `node dist/apps/api/src/main.js`, sem migration automática no
  boot; `.dockerignore` correspondente na raiz. Validado: `yarn validate`
  aprovado; build real da imagem a partir da raiz; container iniciado
  contra o `postgres`/`redis` locais já existentes (via
  `host.docker.internal`, sem parar/recriar nenhum dos dois) com
  `GET /api/v1/health/live`/`GET /api/v1/health/ready` respondendo `200`;
  usuário não-root confirmado (`whoami` → `node`); ausência de
  `prisma.test.config.ts` e de qualquer fonte TypeScript não compilado
  na imagem confirmada; ausência de migration automática no boot
  confirmada via `/proc/1/cmdline`; comando explícito
  `yarn workspace api prisma migrate deploy --config prisma.migrate.config.ts`
  executado dentro da imagem exclusivamente contra `mockp_test` (host e
  nome do banco confirmados antes), idempotente (`No pending migrations
to apply`); container de teste encerrado ao final, sem alterar o
  profile `full` do Compose. Durante a validação, duas lacunas factuais
  da ADR 006 foram corrigidas (a decisão em si não mudou): o caminho
  real do `CMD` é `dist/apps/api/src/main.js`, não
  `dist/apps/api/main.js`; e o cache do Corepack, isolado por `$HOME`
  por padrão, precisou de `COREPACK_HOME` fixo e de `/app` com posse
  ajustada para `node`, para que nenhuma chamada de rede nem erro de
  permissão ocorresse em runtime — ver ADR 006 para o texto corrigido.
- **3.6 — Validação integrada e fechamento documental**: **`Completed`**
  — aprovada tecnicamente. Checklist de ponta a ponta desta fase
  verificado sem nenhum item pendente ou bloqueado:
  - **Compose sobe**: `docker compose up` do profile padrão já
    comprovado na Tarefa 3.1 (evidência histórica); `docker compose ps`
    confirmou nesta rodada que `postgres`/`redis` permanecem saudáveis,
    sem parar ou reiniciar nenhum dos dois (prova nova).
  - **Migration aplica**: `db:migrate:deploy:test` executado contra
    `mockp_test`, idempotente (`No pending migrations to apply` — prova
    nova); migration em banco limpo permanece evidência histórica da
    Tarefa 3.2, não repetida nesta rodada.
  - **Seed roda**: `db:seed:test` executado contra `mockp_test`,
    idempotente (`Seed complete: 2 role(s) in the catalog` — prova
    nova).
  - **Readiness reflete falha real**: evidência histórica da Tarefa 3.4
    (validação operacional manual, parada/recuperação individual de
    `redis`/`postgres`) — reaproveitada, não repetida nesta rodada.
  - **Dockerfile builda e inicia**: imagem reconstruída a partir da
    raiz do monorepo (manifest idêntico ao build da 3.5 — build
    reprodutível) e iniciada em um container novo e temporário, com
    liveness/readiness `200`, usuário `node` e ausência de migration
    automática (`/proc/1/cmdline`) reconfirmados (prova nova); container
    de teste encerrado ao final.
  - Adicionalmente, confirmados nesta rodada: índice GiST em
    `addresses.location` (via `pg_indexes`) e as 15 tabelas de domínio
    da ADR 007 (via `\dt` em `mockp_test`), sem nenhuma tabela fora do
    núcleo revisado; `yarn validate` e `yarn validate:infra` reaprovados
    de ponta a ponta (mesmas contagens da 3.4 — nenhum teste novo nesta
    tarefa).
  - **ADR 006 permanece `Accepted`** (nunca reaberta como `Proposed`,
    não alterada nesta tarefa). **Divergência histórica sinalizada**: a
    ADR 006 registra um catálogo original de 4 papéis globais
    (`RoleName { CUSTOMER AGENT MANAGER ADMIN }`), parte da modelagem de
    dados que a ADR 007 supersede explicitamente — o seed atual, com 2
    papéis globais (`CUSTOMER`, `ADMIN`), está correto e reflete a ADR
    007; as menções a "4 papéis" na ADR 006 são registro histórico, não
    o contrato atual.
  - **README/roadmap atualizados para `Completed` na mesma alteração**
    (esta).
  - Nenhum volume foi recriado ou removido, nenhuma dependência foi
    parada manualmente nesta rodada, `db:reset` não foi usado, `mockp`
    não foi tocado, e o profile `full` não foi executado.

**Entregáveis**:

- `docker-compose.yml` com o **profile padrão**: PostGIS (PostgreSQL
  com extensão PostGIS) e Redis, com health checks e volumes nomeados.
- Dockerfile de `apps/api` (versão de imagem-base fixada, usuário
  não-root quando suportado, sem depender de arquivos não copiados ou
  de `node_modules` do host) — construído e validado nesta fase
  (Tarefa 3.5, `Completed`); usado depois pelo profile `full`, cuja
  execução conjunta é validada na Fase 9.
- Schema Prisma com as 15 entidades definidas pela
  [ADR 007](adr/007-multi-tenant-workspace-foundation.md) (`Accepted`,
  autoridade da modelagem — supersede exclusivamente a modelagem de
  dados da ADR 006): `User`, `Credential`, `AuthIdentity`, `Role`,
  `UserRole`, `CustomerProfile`, `AgentProfile`, `AgentLicense`,
  `Workspace`, `WorkspaceMembership`, `WorkspaceMembershipRole`,
  `WorkspaceAgent`, `Brokerage`, `Property`, `Address`, com os
  relacionamentos resumidos em
  [docs/TARGET_ARCHITECTURE.md](TARGET_ARCHITECTURE.md), seção 10, e
  detalhados campo a campo na ADR 007.
- Repository por agregado (ex.: `Property` + `Address` no mesmo
  repository), não um repository por tabela.
- Migration inicial e seed mínimo determinístico.
- `GET /api/v1/health/ready` verificando PostgreSQL/PostGIS e Redis de
  verdade (substituindo a checagem apenas de inicialização da Fase 2) —
  `Completed` na Tarefa 3.4; falha de qualquer dependência retorna `503`
  com Problem Details e `code: SERVICE_UNAVAILABLE`, sem o campo
  `checks`.

**Validações**:

- `docker compose up` (profile padrão) sobe PostGIS e Redis com
  sucesso, com health checks passando.
- A imagem do Dockerfile de `apps/api` builda com sucesso, e a API
  inicia corretamente a partir dessa imagem (não apenas via `nx serve`)
  — confirmado na Tarefa 3.5, `Completed`, com liveness/readiness
  respondendo `200` a partir do container.
- Migration aplica sem erros em ambiente limpo.
- Seed roda de forma idempotente e determinística.
- Índice GiST presente na coluna geoespacial de `Address`.
- Derrubar PostgreSQL ou Redis faz `GET /api/v1/health/ready` responder
  `503` com `code: SERVICE_UNAVAILABLE` — confirmado na Tarefa 3.4 tanto
  por testes offline (mocks) quanto por validação operacional manual
  (parada/recuperação individual de cada serviço contra a API local).

**Critérios de aceite**:

- Modelo de dados conforme seção 10 de
  [docs/TARGET_ARCHITECTURE.md](TARGET_ARCHITECTURE.md) e a
  [ADR 007](adr/007-multi-tenant-workspace-foundation.md) (autoridade
  da modelagem), sem nenhuma entidade de negócio fora do núcleo
  revisado. Infraestrutura, Prisma/configuração e pipeline continuam
  conforme a [ADR 006](adr/006-persistence-and-local-infrastructure.md).
- Readiness da API reflete a saúde real das dependências
  (PostgreSQL/PostGIS e Redis) — **atendido pela Tarefa 3.4,
  `Completed`**.
- Dockerfile de `apps/api` builda com sucesso e a API inicia a partir
  da imagem gerada — **atendido pela Tarefa 3.5, `Completed`**.
- Validação integrada de ponta a ponta desta fase, sem nenhum item
  pendente ou bloqueado — **atendido pela Tarefa 3.6, `Completed`**.
  **A Fase 3 como um todo está `Completed`** — anterior à Fase 4, que
  também está `Completed` (subtarefas 4.1 a 4.7 `Completed` e
  aprovadas — ver seção própria abaixo).

---

## Fase 4 — Worker e BullMQ

**Status**: Completed. As subtarefas 4.1 a 4.7 estão `Completed` e
aprovadas (detalhamento abaixo). Ao fechar a Fase 4 nenhuma fase
estava `In Progress`; a Fase 5 foi aberta depois, pela subtarefa 5.0
(ver sua seção própria).

**Objetivo**: validar a separação entre API e worker através de um job
puramente técnico, sem expor esse fluxo via HTTP.

**Subtarefas**:

- **4.1 — `libs/queue` e `@mockp/config/worker`**: `Completed` —
  aprovada. `libs/queue` (package-based, sem `project.json`, mesmo
  padrão de `libs/config`) com `SYSTEM_QUEUE_NAME` (`'system'`),
  `SYSTEM_PING_JOB_NAME` (`'system.ping'`), `SYSTEM_PING_JOB_OPTIONS`
  (retry finito: `attempts: 3`, backoff exponencial de `1000`ms) e
  `SystemPingJobPayload` (`publishedAt`, `requestId` sempre presente)
  — nenhuma dependência de NestJS/Express, nenhum `QueueModule`. Novo
  entrypoint `@mockp/config/worker` (`WorkerConfig`/`workerEnvSchema`:
  somente `NODE_ENV`/`LOG_LEVEL`/`REDIS_URL`, reaproveitando a
  validação de `REDIS_URL` já existente em `@mockp/config/server`).
  Versões exatas fixadas (sem `^`/`~`): `bullmq@6.3.9`,
  `@nestjs/bullmq@12.0.0` (peer dependencies compatíveis, confirmado
  via `yarn npm info` — a defasagem que se cogitava entre as duas libs
  não existe na versão atual), `ioredis@6.0.0` (já usada pela API
  desde a Fase 3).
- **4.2 — Skeleton de `apps/worker`**: `Completed` — aprovada.
  `apps/worker` (hand-authored, mesmo padrão de `apps/api`/
  `libs/config`, sem gerador Nx) com `main.ts`
  (`NestFactory.createApplicationContext`, nunca `app.listen()`, já
  que o worker nunca aceita tráfego HTTP) e `AppModule` mínimo
  (`RuntimeConfigModule`+`LoggerModule` próprios do worker; nenhum
  `ThrottlerModule`/CORS/Helmet/Swagger). `nx run worker:build`/
  `worker:serve` confirmados. Teste de graceful shutdown implementado
  em duas provas complementares, decisão tomada nesta subtarefa após
  um achado de plataforma: no Windows, `child.kill('SIGTERM'/'SIGINT')`
  termina o processo abruptamente (`TerminateProcess`) sem entregar o
  sinal ao handler JS — confirmado isoladamente, não é defeito do
  código. Por isso: (1) um teste in-process (`app.close()`,
  cross-platform, mesmo padrão de `apps/api/test/shutdown.spec.ts`)
  prova que os hooks de lifecycle resolvem sem erro; (2) um teste de
  processo real (spawn + `SIGTERM`) prova que o processo termina dentro
  de um prazo finito, com a limitação de plataforma documentada no
  próprio teste — a prova completa de `SIGTERM` real (processo
  containerizado, Linux) fica exclusivamente para a Tarefa 4.6. Isolamento de
  import confirmado: nenhuma linha em `apps/worker/src/**`/
  `apps/worker/test/**` importa `apps/api/src/**`.
- **4.3 — Conexão Redis própria do worker e `SystemPingProcessor`**:
  `Completed` — aprovada. `apps/worker/src/queue/queue-redis.module.ts`
  (instância `ioredis` própria do worker, `maxRetriesPerRequest: null`
  — requisito documentado do BullMQ, o oposto do
  `maxRetriesPerRequest: 1` do `RedisService` da API, que nem existe
  em `apps/worker` e nunca é reaproveitado — ver
  docs/adr/006-persistence-and-local-infrastructure.md §3.2);
  `system-ping.processor.ts` (`@Processor(SYSTEM_QUEUE_NAME)` via
  `@nestjs/bullmq`, estende `WorkerHost`); `system-ping.module.ts`
  (wiring via `BullModule.forRootAsync`+`registerQueue`).
  `apps/worker/package.json` sem `@prisma/client`/`prisma`/
  `@prisma/adapter-pg`/`pg`. **Duas lacunas identificadas nesta
  subtarefa foram corrigidas depois, na Tarefa 4.5** (ver abaixo, não
  reabrem o status `Completed` desta): (1) o processor usava
  `logger.log(mensagem, contexto)`/`logger.error(mensagem, contexto)`
  — a chamada mensagem-primeiro que o `nestjs-pino` descarta
  silenciosamente, e o caminho de erro ainda incluía o `Error` bruto no
  contexto; (2) `SystemPingModule` ainda não estava importado em
  `AppModule.forRoot()` do worker. **Achado que mudou o plano de
  execução, não a decisão técnica**: `@nestjs/bullmq@12.0.0` fecha
  automaticamente o `Worker` do BullMQ no shutdown sempre sem `force`
  (`worker.close()`), o que trava indefinidamente quando o Redis está
  inacessível — confirmado isoladamente (fora do Nest) e no
  código-fonte da lib. Por isso, o wiring de `SystemPingModule` em
  `AppModule.forRoot()` foi adiado desta subtarefa para a Tarefa 4.5,
  validado contra Redis real via `yarn validate:infra` — decisão
  registrada aqui, executada lá.
- **4.4 — Comando interno da API que publica `system.ping`**:
  `Completed` — aprovada. `apps/api/src/queue/queue-redis.module.ts`
  (conexão `ioredis` própria da API para o producer, mesmo motivo da
  4.3, nunca reaproveita `RedisService`) com
  `QueueRedisConnectionCloser` (`@Injectable() implements
OnApplicationShutdown`, dono explícito do encerramento gracioso dessa
  conexão — só chama `quit()` quando `status === 'ready'`, sob timeout
  de 2s, com fallback para `disconnect()` síncrono; nunca loga a razão
  da falha, `cause` ou objeto `Error`, só uma mensagem estática fixa —
  a ordem em que o `Queue` do BullMQ fecha antes desta conexão é uma
  suposição de design a confirmar em execução real, não uma garantia
  absoluta); `system-ping.publisher.ts` (`SystemPingPublisher`,
  `@InjectQueue`, `publish(requestId = randomUUID())` chama
  `queue.add(SYSTEM_PING_JOB_NAME, payload, SYSTEM_PING_JOB_OPTIONS)`,
  loga `jobId`/`requestId` via chamada **objeto-primeiro** do Logger —
  necessário porque o `nestjs-pino` descarta silenciosamente um objeto
  passado como _segundo_ argumento de `Logger.log(msg, obj)` quando o
  logger é instanciado com contexto próprio (`new Logger(ClassName)`);
  achado confirmado contra a serialização JSON real do Pino, não só
  contra os argumentos de um spy — um teste dedicado prova isso com um
  `Test.createTestingModule` real, sem mockar `Logger`);
  `system-ping-producer.module.ts`/`system-ping-command.module.ts`
  (módulo mínimo — só `RuntimeConfigModule`+`LoggerModule`+producer,
  nunca o `AppModule.forRoot()` completo da API HTTP);
  `system-ping.command.ts` (`NestFactory.createApplicationContext`,
  nunca `app.listen()`, nunca `process.exit()`). Novo alvo Nx
  `queue:smoke:system-ping` (`tsx --tsconfig tsconfig.app.json`, fora
  de `yarn validate`/`yarn validate:infra`). **Validado com Redis real
  do Compose local** (containers `postgres`/`redis` saudáveis, sem
  parar/recriar nenhum dos dois): execução única, saída do processo em
  prazo finito (código `0`), sem `process.exit()` forçado; confirmado
  por inspeção direta do Redis (somente leitura — `--scan`/`HGETALL`,
  nunca `FLUSHDB`/`KEYS *`) e pelo log estruturado real: exatamente um
  job `system.ping` criado por execução, payload com `requestId`/
  `publishedAt`, `attempts: 3` e backoff exponencial de `1000`ms
  batendo com `SYSTEM_PING_JOB_OPTIONS`. **Nenhum processamento do job
  foi exigido ou provado nesta subtarefa** — à época da 4.4, o consumidor ainda não
  está ligado ao `AppModule` do worker (ver 4.3); essa prova pertence à
  Tarefa 4.5. O job de cada execução real foi removido apenas via
  `queue.getJob(id).remove()` (API do BullMQ) depois de registrar a
  evidência — nunca limpeza de fila inteira, nunca job pré-existente
  tocado. Nenhum endpoint HTTP, rota ou entrada OpenAPI/Swagger criada
  para `system.ping`.
- **4.5 — Teste automatizado de ponta a ponta em `yarn validate:infra`**:
  `Completed` — aprovada tecnicamente. Três entregas principais:
  - **Correção do logging do `SystemPingProcessor`** (pontos de revisão
    registrados na 4.3): `logger.log(mensagem, contexto)`/
    `logger.error(mensagem, contexto)` (mensagem-primeiro, perdida
    silenciosamente pelo `nestjs-pino`) substituídos pela chamada
    **objeto-primeiro** (`logger.log(contexto, mensagem)`), mesmo
    padrão já corrigido na 4.4 para `SystemPingPublisher`. O caminho de
    erro (`logger.error(contexto, 'Failed to process system.ping
job')`) não inclui mais o `Error` bruto, `message` nem `cause` — só o
    mesmo contexto seguro (`requestId`/`publishedAt`/`jobId`); o erro
    continua sendo relançado para o BullMQ aplicar retry. Prova real de
    serialização adicionada (`Test.createTestingModule`+Pino real, sem
    mockar `Logger`, mesmo padrão da 4.4): confirma `requestId`/`jobId`
    como campos de topo no JSON real, não só como argumentos de um spy.
  - **`SystemPingModule` agora importado em `AppModule.forRoot()`** do
    worker — o `setInterval` interino da 4.2 foi removido (o `Worker`
    real do BullMQ mantém o processo vivo sozinho). Só depois disso o
    worker passou a consumir jobs de verdade.
  - **`QueueRedisConnectionCloser` do worker** (novo,
    `apps/worker/src/queue/queue-redis-connection.closer.ts`, mesmo
    padrão do já existente na API desde a 4.4): investigação confirmou
    que nem `Queue.onApplicationShutdown` do `@nestjs/bullmq` (só
    desconecta se `forceDisconnectOnShutdown`, nunca o padrão) nem
    `BullExplorer.onApplicationShutdown` (só fecha o `Worker`, nunca a
    conexão externa) fechavam a conexão `ioredis` própria do worker —
    confirmado com um teste que captura a conexão via DI e observa
    `status` permanecer `'ready'` após `app.close()` sem essa classe.
    Com a correção, `apps/worker/test/infra/shutdown.spec.ts` prova
    `status === 'end'` depois de `app.close()` — não só que a promise
    resolveu. Log de erro do listener de erro do `QueueRedisModule`
    também corrigido para objeto-primeiro (preserva o campo `code`).
  - **Teste E2E real** (`apps/api/test/infra/queue/system-ping.infra.spec.ts`):
    publica via `SystemPingPublisher` real (o mesmo producer da API),
    worker real spawnado como processo separado, consome via Redis do
    Compose; confirma payload, `jobId`, `requestId` propagado (log real
    - estado `completed` do job). **Isolamento**: fila `system` operada
      num banco lógico Redis dedicado (`/1` na URL, `SELECT 1`) —
      reservado **por convenção**, não por garantia técnica (Redis não
      impõe ACL entre bancos lógicos do mesmo servidor). Por isso, antes
      de iniciar o worker, uma verificação **somente leitura e
      fail-closed** (`assertReadyForIsolatedRun`) confirma que
      `REDIS_URL` aponta para um host local e que a fila `system` nesse
      banco não tem nenhum job pendente (`waiting`/`waiting-children`/
      `active`/`delayed`/`prioritized`) — se encontrar algo, recusa
      iniciar o worker com uma mensagem sanitizada (só contagens
      agregadas, nunca a URL), sem processar nem remover nada de
      terceiros. Comprovado empiricamente: um job decoy inserido
      manualmente no banco 1 fez o teste falhar em ~150ms, antes de
      sequer criar o processo do worker, e o decoy permaneceu intocado.
      Limpeza restrita ao job criado por esta própria execução
      (`queue.getJob(id)`→`remove()`→reverificação de ausência), em
      `finally`, mesmo quando uma asserção falha antes; falha de limpeza
      vira falha do teste, reportando só o `jobId`, nunca `Error` bruto
      nem URL, e nunca mascara uma falha de asserção anterior.
  - **Prova de retry/backoff separada**
    (`apps/api/test/infra/queue/system-ping-retry.infra.spec.ts`): um
    `Queue`/`Worker` criados só para este teste, numa fila com nome
    exclusivo (`system-ping-retry-test-<uuid>`, nunca `system`),
    usando as mesmas `SYSTEM_PING_JOB_OPTIONS` de produção, com um
    handler que falha de propósito nas primeiras tentativas e sucede na
    última — sem `failFirstNAttempts`, sem gate por `NODE_ENV`, sem
    nenhum mecanismo de falha no processor/payload de produção. Os
    atrasos medidos são comparados contra o valor exato que a fórmula
    de backoff exponencial do BullMQ prevê para `1000`ms/`attempts: 3`
    (`[1000, 2000]`ms), com tolerância — não mais uma comparação frouca
    "cada atraso maior que o anterior". Limpeza (`worker.close(true)`,
    `queue.obliterate()`, `queue.close()`, verificação de chaves
    remanescentes) com cada etapa isolada em seu próprio `try/catch`:
    uma falha em qualquer uma nunca impede as seguintes, e
    `connection.disconnect()` roda sempre, de forma incondicional;
    falhas de limpeza são reportadas juntas, de forma sanitizada, nunca
    silenciadas.
  - **Resultados**: `yarn validate` (offline) permanece 100% offline —
    `worker:test:integration` roda com zero arquivos
    ("No test files found, exiting with code 0"), já que os testes de
    shutdown do worker migraram para `apps/worker/test/infra/`
    (precisam de Redis real, dado que `AppModule` agora inclui o
    `Worker` de verdade); `api:test` **192** testes unitários,
    `worker:test` **15** (11 novos do `QueueRedisConnectionCloser` do
    worker + 4 do processor, incluindo a prova de serialização real);
    `api:test:integration` **49** (inalterado). `yarn validate:infra`:
    `api:test:integration:infra` **55 testes/13 arquivos** (53
    anteriores + E2E + retry), `worker:test:integration:infra`
    (novo alvo Nx, também adicionado ao script raiz) **2 testes/2
    arquivos**. Na última rodada de validação, os containers
    `postgres`/`redis` já existentes estavam parados e foram iniciados
    com `docker compose start` (sem recriação, sem `down`, sem perda de
    volumes) e terminaram saudáveis; nenhum foi recriado ou removido;
    nenhum processo Node órfão; nenhuma chave
    residual em `bull:system:*` (nenhum dos dois bancos) nem
    `bull:system-ping-retry-test-*` após as execuções.
  - **Dois riscos residuais distintos, não resolvidos nesta subtarefa**:
    (1) a isolação por banco lógico é convencional, não uma garantia
    técnica — uma execução concorrente desta mesma suíte, ou um
    producer real apontando deliberadamente para o banco 1, ainda
    poderiam colidir com o guard fail-closed (documentado no código;
    aceitável para `yarn validate:infra` local, single-machine); (2) a
    prova de `SIGTERM` real entregue a um processo containerizado em
    Linux continua pendente à época da 4.5 — no Windows, `child.kill('SIGTERM')`
    termina o processo abruptamente (`TerminateProcess`) sem entregar o
    sinal ao handler JS (achado da 4.2, reconfirmado aqui), então
    `apps/worker/test/infra/shutdown-process.spec.ts` só prova que o
    processo termina dentro de um prazo finito nesta plataforma — a
    prova completa ficou para a Tarefa 4.6 (worker containerizado,
    Linux), **entregue na 4.6-B** (ver abaixo).
- **4.6 — Dockerfile do worker**: `Completed` — aprovada tecnicamente,
  entregue em duas partes distintas, cada uma com autorização própria:
  - **4.6-A — Ajuste do Dockerfile da API**
    ([apps/api/Dockerfile](../apps/api/Dockerfile)): a API passou a
    depender de `@mockp/queue` na 4.4, e o `yarn.lock` passou a
    registrar os workspaces `apps/worker` e `libs/queue`; o Dockerfile
    da 3.5 só copiava o `package.json` de `apps/api` e `libs/config`,
    então o build da imagem da API estava **quebrado desde a 4.4**
    (defeito latente — a imagem não havia sido reconstruída desde a
    3.5). Confirmado em cópias isoladas fora do repositório, com Yarn
    4.12.0: só `api`+`config` falha (`@mockp/queue@workspace:*:
Workspace not found`); `api`+`config`+`queue` também falha (o
    lockfile seria modificado, `worker` removido); o grafo completo de
    quatro workspaces passa. Ajuste: `apps/worker/package.json` e
    `libs/queue/package.json` copiados no stage `build` antes de `yarn
install --immutable` e também no stage `runtime`; fontes
    (`tsconfig*.json`, `src`, `*.md` — asset do build) de `libs/queue`
    copiadas no stage `build`; `libs/queue/dist` copiado no stage
    `runtime` (o `exports.default` de `@mockp/queue` aponta para
    `./dist/src/index.js`). Validado: `docker build` a partir da raiz;
    container temporário contra `mockp_test`/Redis com `GET
/api/v1/health/live` e `GET /api/v1/health/ready` respondendo
    `200` (`application`/`database`/`redis` = `up`); usuário `node`;
    `/proc/1/cmdline` = `node dist/apps/api/src/main.js` (sem
    migration no boot); `@mockp/queue` resolvendo para
    `/app/libs/queue/dist/src/index.js`; ausência de
    `prisma.test.config.ts` na imagem; comando explícito `yarn
workspace api prisma migrate deploy --config
prisma.migrate.config.ts` dentro da imagem, somente contra
    `mockp_test`, idempotente (`No pending migrations to apply`).
    Container removido ao final; `postgres`/`redis` nunca parados.
  - **4.6-B — Dockerfile do worker**
    ([apps/worker/Dockerfile](../apps/worker/Dockerfile)): multi-stage
    (`build`/`runtime`), mesma imagem-base fixada
    (`node:24.18.0-bookworm-slim`) e Yarn `4.12.0` via Corepack
    (`COREPACK_HOME` fixo) do Dockerfile da API, contexto na raiz do
    monorepo, `HUSKY=0`, usuário final não-root (`node`). O stage
    `build` copia o grafo completo de `package.json` (os quatro
    workspaces — sem isso `--immutable` falha, como na 4.6-A) e só as
    fontes de `worker`, `libs/config` e `libs/queue`; compila via `yarn
nx run worker:build`. O stage `runtime` leva `node_modules`
    completo, `libs/config/dist`, `libs/queue/dist` e
    `dist/apps/worker`; nenhuma fonte de `apps/api`. `CMD` é `node
dist/apps/worker/src/main.js` (caminho real confirmado no build —
    o `CMD` inicial, sem `src/`, estava errado e foi corrigido antes da
    validação), sem migration no boot. **O `node_modules` completo
    inclui pacotes Prisma/`pg` inertes na imagem** — escolha aprovada
    por simplicidade, espelhando a API, deixando a otimização (`yarn
workspaces focus --production`) para depois; não se alega ausência
    física desses pacotes. O que **é** provado: o worker não importa
    nem acessa Prisma/banco — nenhum `require` de `prisma`/`pg`/
    `apps/api` em `dist`/`libs/*/dist` (só menções em comentários),
    nenhum `import` equivalente nas fontes do worker, e um teste de
    carga real no container (902 módulos em cache após carregar o
    `AppModule` e `@nestjs/bullmq`, zero deles Prisma, `apps/api` ou
    `pg`). Validado: build real da imagem; preflight fail-closed
    somente leitura antes de iniciar o container (mesmo `run_id` do
    Redis lido do host e de um container via `host.docker.internal`,
    ambos no banco lógico `1`; fila `system` sem nenhum job em
    `waiting`/`waiting-children`/`active`/`delayed`/`prioritized` e sem
    nenhuma chave além de `bull:system:events`/`meta`/`id`, resto de
    execuções anteriores); worker no container (`Worker started`)
    consumiu de verdade um `system.ping` publicado pelo comando interno
    da API no host — mesmo `requestId` e `jobId` nos logs do producer e
    do container, job `completed` no Redis. **SIGTERM real em Linux**:
    `docker stop --time 10` terminou em 478 ms com `ExitCode=0`,
    `OOMKilled=false`, `State.Error` vazio; saída graciosa,
    distinguível de SIGKILL (137, só após o prazo de 10 s), sem
    `--init`; a conexão Redis do worker sumiu do `CLIENT LIST` (3
    clientes → 1), evidência complementar apenas. Cleanup restrito ao
    que o teste criou (o job e o container nomeado; nunca `FLUSHDB`/
    `KEYS *`/`obliterate`/`docker compose down`). `postgres`/`redis`
    saudáveis o tempo todo, nunca parados/recriados. A imagem de teste
    `mockp-worker:4.6-test` (262.045.633 bytes de conteúdo; ~1,31 GB em
    disco no Docker Desktop) **foi mantida**, assim como
    `mockp-api:4.6a-test`. `yarn validate` (offline) e `yarn
validate:infra` (55 testes/13 arquivos na API, 2 testes/2 arquivos
    no worker) aprovados; nenhum teste novo nesta subtarefa.
  - **Riscos residuais da 4.6**: (1) `host.docker.internal` só existe
    no Docker Desktop — outro ambiente exigiria outro caminho; (2) o
    isolamento por banco lógico `1` segue sendo convenção, não garantia
    técnica (risco da 4.5, mitigado pelo preflight, não eliminado); (3)
    o grafo completo de workspaces agora está duplicado nos Dockerfiles
    da API e do worker — um novo workspace exigirá ajustar os dois; (4)
    imagem grande por causa do `node_modules` completo; (5)
    **divergência factual da ADR 006 apenas reportada, não
    corrigida**: a seção "Dockerfile da API e Prisma" lista só
    `libs/config` na cópia de workspaces, sem `libs/queue`/
    `apps/worker` — a ADR **não foi alterada**, permanece `Accepted`;
    (6) o Dockerfile do worker não foi exercitado via Compose `full`
    (Fase 9).
- **4.7 — Validação integrada e fechamento documental**: `Completed` —
  aprovada tecnicamente. Executada em duas etapas com autorizações
  distintas (validação com efeitos locais controlados; depois este
  fechamento documental), sem commit.
  - **Evidências novas desta rodada** (executadas na 4.7, nunca só
    reaproveitadas): `git diff --check` limpo; `yarn validate` com
    cache do Nx **desligado** (todos os alvos reexecutados) aprovado —
    testes unitários `api` 192, `worker` 15, `config` 41, `queue` 2;
    integração offline da API 49 (13 arquivos), `worker:test:integration`
    sem arquivos (esperado desde a 4.5); `yarn validate:infra`
    aprovado — `db:migrate:deploy:test` sem pendências, seed idempotente
    (2 papéis), `api:test:integration:infra` 55 testes/13 arquivos e
    `worker:test:integration:infra` 2 testes/2 arquivos. Verificações
    estáticas: nenhum import entre `apps/api` e `apps/worker` além de
    `libs/queue`/`libs/config`; nenhum `import`/`require` de Prisma,
    `pg` ou `apps/api` em `apps/worker`, `libs/queue`,
    `libs/config/src/worker` nem nos `dist` compilados; os únicos
    controllers de `apps/api/src` são os de health (nenhum controller
    em `queue/` nem em `apps/worker`, e o `AppModule` da API não
    importa módulo de fila); varredura de segredos nos arquivos novos e
    nos dois Dockerfiles sem achados. **Sem endpoint nem entrada
    Swagger para `system.ping`**: `apps/api/test/swagger.spec.ts`
    (aprovado) afirma que o documento lista exatamente
    `/api/v1/health/live` e `/api/v1/health/ready`, e o `/docs-json` da
    API rodando na imagem reconstruída listou apenas essas duas rotas —
    verificação feita contra o Swagger gerado em runtime, sem pressupor
    um `openapi.json` versionado (nenhum existe neste repositório
    ainda; pertence à Fase 5). Ciclo completo de imagens com **tags
    novas** (`mockp-api:4.7-test`, `mockp-worker:4.7-test`; as tags
    anteriores `4.6-test`, `4.6a-test`, `tarefa-3.5` e `tarefa-3.6`
    preservadas; tamanhos só informativos: API 262.100.714 B, worker
    262.045.633 B, sem igualdade de tamanho/manifest como critério):
    preflight fail-closed somente leitura (mesmo `run_id` do Redis pelos
    caminhos do host e do container, banco lógico `1`, fila `system`
    sem job pendente e sem chave além das de infraestrutura) antes de
    qualquer escrita; API na imagem com `live`/`ready` `200`, usuário
    `node`, cmdline sem migration, `@mockp/queue` resolvendo em
    `/app/libs/queue/dist/src/index.js`, sem `prisma.test.config.ts`;
    worker na imagem (usuário `node`, `CMD` `node
dist/apps/worker/src/main.js`, 902 módulos carregados e nenhum de
    Prisma/`apps/api`/`pg`); worker em container consumiu o job `14`
    publicado do host pelo comando interno, com o mesmo `requestId` nos
    dois lados e o job `completed` no Redis; **SIGTERM real em Linux**:
    `docker stop --time 10` em 488 ms, `ExitCode=0`,
    `OOMKilled=false`, sem erro, sem `--init`, sem `SIGKILL`, e
    `CLIENT LIST` de 3 para 1 apenas como evidência complementar.
    Cleanup restrito ao que a execução criou (job `14`, removido só
    após conferir o `requestId`, e os containers nomeados e
    rotulados); `postgres`/`redis` nunca iniciados, parados ou
    recriados por esta tarefa. **Verificação de identidade do banco,
    refeita**: o `migrate deploy` da imagem da API contra `mockp_test`
    executado na primeira passagem não teve, antes da escrita, a
    consulta da conexão real; ele foi repetido (idempotente, "No
    pending migrations to apply") só depois de verificar, sem expor
    credenciais, host `host.docker.internal`, porta `5432`, banco
    `mockp_test` e, na conexão real, `current_database()` =
    `mockp_test` com o mesmo `system_identifier` do `postgres` do
    Compose; `_prisma_migrations` em `mockp_test` conferida (1/1).
    A chave `bull:system:stalled-check`, vista no banco 1 após o
    `validate:infra`, foi tratada como chave de controle do `Worker` do
    BullMQ (gravada com `SET … PX`, confirmado no código-fonte da
    lib); na etapa de validação ela foi aceita na allowlist do
    preflight sem inspecionar `TYPE`/`PTTL` na hora, e só depois se
    confirmou que expirou sozinha (`TYPE=none`) — registro de rigor,
    sem efeito no resultado, já que `waiting`/`active`/`delayed`/
    `prioritized` e as demais listas de jobs estavam em 0.
  - **Evidências históricas reaproveitadas, não repetidas**: achado de
    plataforma de que no Windows o SIGTERM não chega ao handler JS
    (4.2); execução do job decoy que fez o guard fail-closed recusar
    (4.5 — o teste automatizado do guard e a prova de retry/backoff
    rodaram de novo dentro do `validate:infra`, mas o decoy manual não
    foi repetido); migration em banco limpo (3.2); queda real de
    PostgreSQL/Redis fazendo `ready` responder `503` (3.4).
  - **Correlation ID — o que esta fase comprova e o que não**:
    comprovado, no comando interno `queue:smoke:system-ping`, o
    `requestId` (UUID gerado pelo comando) desde o payload do job até o
    log do `SystemPingProcessor`, inclusive com o worker dentro do
    container. **Não comprovado**: a propagação do header `X-Request-Id`
    de uma requisição HTTP até um job — nenhum endpoint HTTP enfileira
    jobs nesta fase, por critério de aceite; o middleware de
    `X-Request-Id` é coberto apenas pelos testes do skeleton da API
    (`request-id.spec.ts`, `logging.spec.ts`, `health.spec.ts`), sem
    elo com a fila. Esse elo só poderá ser provado por uma fase futura
    que introduza um fluxo real de enfileiramento a partir de uma
    requisição.
  - **Riscos residuais da Fase 4**: (1) o isolamento por banco lógico
    `1` é convencional, não uma garantia técnica — o preflight mitiga,
    não elimina uma execução concorrente; (2) `host.docker.internal`
    só existe no Docker Desktop; (3) o grafo de workspaces está
    duplicado nos Dockerfiles da API e do worker; (4) imagens grandes
    por causa do `node_modules` completo (pacotes Prisma/`pg` inertes
    no worker); (5) o Dockerfile do worker não foi exercitado via
    Compose `full` (Fase 9); (6) a ADR 006 segue com a divergência
    factual apenas reportada (a seção "Dockerfile da API e Prisma" lista
    só `libs/config`, sem `libs/queue`/`apps/worker`) — **a ADR não foi
    alterada**, permanece `Accepted`; (7) a propagação de `X-Request-Id`
    HTTP → job segue não comprovada. A nota factual da seção 12 de
    `docs/TARGET_ARCHITECTURE.md` foi corrigida nesta mesma alteração
    (só o estado de implementação do Dockerfile do worker; a decisão
    arquitetural permanece inalterada).
  - **Fechamento**: **a Fase 4 — Worker e BullMQ — está `Completed`**.
    À época deste fechamento nenhuma fase estava `In Progress` e a
    Fase 5 — OpenAPI e api-client — estava `Pending`, sem nenhuma
    implementação iniciada; ela só foi aberta depois, com autorização
    explícita (ver a seção da Fase 5).

**Entregáveis**:

- `apps/worker` como processo separado, com Dockerfile próprio (versão
  de imagem-base fixada, usuário não-root quando suportado, sem
  depender de arquivos não copiados ou de `node_modules` do host) —
  construído e validado nesta fase; usado depois pelo profile `full`,
  cuja execução conjunta é validada na Fase 9.
- `libs/queue` com definição compartilhada da fila e do job
  `system.ping`.
- Comando/smoke target **interno** da API (não um endpoint HTTP) que
  inicializa o contexto Nest, resolve o producer da fila e publica o
  job `system.ping`. Este fluxo não entra no OpenAPI.

**Validações**:

- A imagem do Dockerfile de `apps/worker` builda com sucesso, e o
  worker inicia corretamente a partir dessa imagem.
- Worker consome o job `system.ping` publicado pelo smoke target da
  API via Redis, propagado como valor de `X-Request-Id`/`requestId` da
  requisição de origem, quando houver uma.
- Teste automatizado verifica: payload do job, processamento pelo
  worker, comportamento de retry, propagação de correlation ID, e
  graceful shutdown do worker.
- Logs estruturados confirmam o processamento do job, incluindo
  correlation ID.

**Critérios de aceite**:

- API e worker operam como processos independentes, comunicando-se
  apenas via Redis/BullMQ, sem import direto de código de domínio entre
  eles além de `libs/queue`.
- Nenhum endpoint público de debug para `system.ping` existe.

---

## Fase 5 — OpenAPI e api-client

**Status**: In Progress. As subtarefas 5.0 (abertura documental), 5.1
(spike), 5.2 (scaffold de `libs/api-client` e dependências) e 5.3
(Dockerfiles e o quinto workspace) e 5.4 (extração do setup HTTP e do
documento Swagger) e 5.5 (documentação de Problem Details, headers e
`operationId`s) estão `Completed`; as subtarefas 5.6 a 5.12 estão
`Pending`. Cada subtarefa exige autorização explícita e
individual, e nenhuma delas autoriza commit, branch ou push. O registro
das decisões está na
[ADR 009](adr/009-openapi-contract-and-api-client.md) (`Proposed`,
complementa a [ADR 001](adr/001-rest-openapi.md) sem alterá-la).

**Objetivo**: fechar o ciclo de contrato determinístico entre backend e
frontend.

**Subtarefas**:

- **5.0 — Abertura documental**: `Completed`. Somente documentação:
  Fase 5 passa a `In Progress` no roadmap, README e AGENTS §6 na mesma
  alteração; subtarefas e decisões registradas aqui; ADR 009 criada
  (`Proposed`); nota curta na seção 6 de
  `docs/TARGET_ARCHITECTURE.md`, sem alterar nenhuma decisão. Nenhum
  código, configuração, dependência ou Dockerfile; ADRs 001–008
  inalteradas.
- **5.1 — Spike isolado (S1)**: `Completed` — aprovado. Investigação
  **sem alterar o repositório** (diretório descartável fora dele, já
  removido; HEAD, `git status`, hash do `git diff`, `yarn.lock`,
  `package.json` e `node_modules` idênticos antes e depois), com Yarn
  4.12.0 e `typescript@6.0.3` exato, sem override. **Nenhuma condição de
  parada disparou.** Resultados: (1) `NestFactory.create(AppModule.forRoot(<config
sintética>), { logger: false })` com e sem `preview: true` — documento
  **idêntico** (SHA bruto igual em 8 processos, 4 variações × 2
  ambientes, e em mais 3 com `TZ`/`LANG`/`cwd` diferentes; inclusive ao
  documento que o `configureApp` real passa ao Swagger), zero chamadas
  a `net.Socket.connect`/`net.connect`/`tls.connect`, zero
  `listen`/`init`, construtores de `PrismaService`/`RedisService` não
  executados em `preview`; independência de ambiente provada (dois
  ambientes, mesmo documento), **sem** afirmar "zero leituras de
  `process.env`" (código de biblioteca enumera o ambiente). (2)
  `@nestjs/swagger` 11.4.7: `@ApiResponse({ content: {
'application/problem+json': … }, headers })` e `@ApiHeader`
  funcionam; **`type` junto com `content` faz o `content type` voltar a
  `application/json`**, e `@ApiProduces` vale para a operação inteira.
  (3) `openapi-typescript` 7.13.0 × TypeScript 6.0.3: gera sem
  exceção; duas execuções (processos separados) idênticas; o
  `schema.d.ts` compila com `tsc` 6.0.3 e as flags estritas do
  workspace com `skipLibCheck: false` (controle negativo confirma que o
  `.d.ts` é checado); uso real com `openapi-fetch` 0.17.0 (consulta
  tipada a `/api/v1/health/live`, path inexistente rejeitado em tipo,
  erro `application/problem+json` tipado). Warning `YN0060` registrado;
  `openapi-typescript` 7.13.0 é a `latest` e nenhuma versão verificada
  (7.9.1 a 7.13.0) declara suporte a TS 6. Candidatas de `openapi-fetch`:
  0.17.0 (a usada) e 0.16.0. (4) Módulos: `require()` das três
  ferramentas funciona no Node 24.18; `openapi-typescript` depende do
  `require(esm)` do Node (falha com `ERR_REQUIRE_ESM` se desativado),
  `openapi-fetch` tem build CJS verdadeiro. (5) Determinismo:
  documento bruto idêntico entre processos; canonicalização D4
  idêntica (200/200 embaralhamentos de chaves); arrays preservados.
  (6) `tsx`: o alvo `queue:smoke:system-ping` resolve as libs para
  `dist` (ausente num checkout limpo); com `--conditions=development`
  resolve para as fontes `.ts`. **Achado que mudou D3**: sob `tsx`
  (esbuild) não há `emitDecoratorMetadata` — a injeção por tipo falha em
  silêncio e `@ApiProperty()` sem `type` explícito quebra a geração
  (compilado com `tsc` funciona), logo o gerador é compilado e
  executado com `node` sobre `dist` (D3, opção B). À época do spike
  as dependências não estavam instaladas no repositório (instaladas na
  5.2).
- **5.2 — Scaffold de `libs/api-client` e dependências**: `Completed`
  — aprovada. Somente scaffold, sem arquivos gerados, cliente, scripts
  nem alvos `contract:*`. Criada `libs/api-client/` no molde de
  `libs/queue` (CommonJS, D18): `package.json` (`@mockp/api-client`,
  bloco `nx` com nome `api-client`, `projectType: library`, alvos
  `build` com `@nx/js:tsc` e `typecheck`, `exports` com
  `types`/`development`/`default`), `tsconfig.json`,
  `tsconfig.lib.json`, `tsconfig.build.json`, `tsconfig.spec.json`,
  `eslint.config.mjs`, `vitest.config.mts` (com `passWithNoTests:
true`, precedente `apps/api`; nenhum teste artificial), `README.md` e
  `src/index.ts` com `export {};` (nenhuma API pública). **Versões
  exatas gravadas (D8)**: `openapi-fetch` 0.17.0 em `dependencies` e
  `openapi-typescript` 7.13.0 em `devDependencies`, sem `^`/`~`;
  `tslib` 2.8.1 em `dependencies`, por espelhar o molde
  (`importHelpers`) — já resolvido no `yarn.lock`, sem resolução nova.
  **Diff do `yarn.lock`**: +201/−12 linhas; 1333 → 1356 descritores (23
  novos: o workspace, as duas dependências e seus transitivos),
  **nenhum descritor removido e nenhuma versão resolvida de pacote
  existente alterada** (verificado comparando os mapas descritor →
  versão antes/depois); as 12 linhas removidas são fusões de lista de
  descritores sem mudar a versão (`@babel/code-frame` ganha `^7.26.2`; a
  entrada `js-yaml@npm:^4.3.2` vira `js-yaml@npm:4.3.2,
js-yaml@npm:^4.3.2`, ambas continuam 7.29.7 e 4.3.2). **Warnings de
  peer** (nenhum virou erro): no workspace, o aviso é `YN0002
@mockp/api-client doesn't provide typescript (pee6a06), requested by
openapi-typescript` (faixa `^5.x`; `yarn explain peer-requirements
pee6a06`), e não o `YN0060` do spike — porque `libs/api-client` não
  lista `typescript` como dependência própria (o TypeScript 6.0.3 vem
  da raiz); sem override, sem `resolutions`, sem `--legacy-peer-deps`,
  sem acrescentar `typescript` ao workspace (fora do escopo); os
  demais `YN0002` (`@nestjs/bullmq` em `api`/`worker`) são anteriores.
  **Validação**: `yarn install --immutable` sem diff adicional;
  `nx show project api-client` descobre o projeto (alvos `lint`,
  `test`, `build`, `typecheck`); `api-client:typecheck`, `:build`,
  `:test` ("No test files found", exit 0) e `:lint` aprovados (cada um
  executou uma única tarefa — o `build` não disparou build nem
  `db:generate` da API); o grafo do Nx (`nx graph --print`) não tem
  nenhuma aresta de ou para `api-client` (D1 preservado); Dockerfiles,
  `.dockerignore`, `nx.json`, `tsconfig.json` raiz, scripts do
  `package.json` raiz e dependências de outros workspaces
  inalterados. **Entre a 5.2 e a 5.3 as imagens Docker da API e do
  worker ficaram conscientemente quebradas** (o `yarn.lock` ganhou o
  quinto workspace e os Dockerfiles ainda não copiavam o seu
  `package.json`) — corrigido na 5.3, e por isso a 5.2 e a 5.3 entraram
  no mesmo commit de checkpoint (`871bd06`).
- **5.3 — Adaptar os Dockerfiles ao quinto workspace**: `Completed` —
  aprovada. Em `apps/api/Dockerfile` e `apps/worker/Dockerfile`, **só**
  o `COPY` de `libs/api-client/package.json` nos stages `build` e
  `runtime` de cada um (4 linhas `COPY`, antes do `COPY` de
  `libs/config`, mesmo padrão dos outros workspaces) e o comentário que
  enumera os workspaces (de quatro para cinco). Nenhuma outra mudança em
  Dockerfiles, `.dockerignore`, `docker-compose.yml`, código,
  configuração, dependências ou `yarn.lock`. **Pré-prova** (cópia fora
  do repositório com os `package.json` que o stage `build` copia):
  `yarn install --immutable` passa com os 5 manifests e falha com os 4
  (`YN0028`, o lockfile seria modificado) — confirma que as imagens
  estavam quebradas desde a 5.2 e que o `COPY` as conserta. **Provas
  reais** (tags novas `mockp-api:5.3-test`, id `9ad829df785c`, e
  `mockp-worker:5.3-test`, id `52a978db1f6e`, ~1,34 GB em disco cada;
  as tags anteriores `4.7-test`, `4.6-test`, `4.6a-test`, `tarefa-3.5`
  e `tarefa-3.6` preservadas): (1) `docker build` das duas imagens a
  partir da raiz, com `yarn install --immutable` passando nos dois
  stages `build`; manifest de camadas coerente com o `COPY` novo (API 22
  → 23 camadas, worker 17 → 18, em relação às imagens `4.7-test`). (2)
  `yarn workspaces list` no runtime das duas imagens (container
  descartável, `--network none`, sem banco) lista os 5 workspaces
  (`.`, `apps/api`, `apps/worker`, `libs/api-client`, `libs/config`,
  `libs/queue`); no runtime só o `package.json` de `libs/api-client`
  existe (sem `src` nem `dist`). (3) API em container contra os
  `postgres`/`redis` locais existentes (via `host.docker.internal`, banco
  `mockp_test`, host e banco conferidos sem expor credenciais):
  `GET /api/v1/health/live` e `/ready` `200` (`application`/`database`/
  `redis` = `up`), `whoami` = `node`, `/proc/1/cmdline` = `node
dist/apps/api/src/main.js`. (4) Worker: preflight fail-closed
  somente leitura (mesmo `run_id` do Redis pelo host e pelo container,
  banco lógico `1`, fila `system` sem nenhum job pendente e sem chave de
  job) antes de iniciar; `Worker started`, `whoami` = `node`,
  `/proc/1/cmdline` = `node dist/apps/worker/src/main.js`; consumo real
  do job `15` publicado do host pelo comando interno, com o mesmo
  `requestId` nos logs do container e o job `completed` no Redis;
  `SIGTERM` real com `docker stop --time 10` em 504 ms, `ExitCode=0`,
  `OOMKilled=false`, sem erro, sem `--init`, sem `SIGKILL`
  (`CLIENT LIST` 3 → 1 apenas como evidência complementar). (5) Cleanup
  restrito ao que a execução criou: job `15` removido só após conferir o
  `requestId`, containers temporários removidos (nenhum com o rótulo de
  teste sobrou); `postgres`/`redis` nunca parados, reiniciados ou
  recriados por esta tarefa e saudáveis ao final. Sem migration no boot,
  `migrate deploy` ou seed. **A 5.2 e a 5.3 entraram no mesmo
  commit de checkpoint (`871bd06`).**
- **5.4 — Extrair o setup HTTP e o documento Swagger**: `Completed` —
  aprovada. Refatoração **sem mudança de contrato nem de comportamento
  HTTP**, em `apps/api/src/app/`: novo `swagger.ts` com
  `createSwaggerDocument(app)` (o `DocumentBuilder` atual — título,
  descrição `skeleton (Fase 2)` e versão inalterados — mais
  `SwaggerModule.createDocument`, sem montar nenhuma rota); em
  `configure-app.ts`, `applyHttpSetup(app, serverConfig)` com tudo o que
  existia antes do Swagger, na mesma ordem (`requestId`, `helmet`, CORS,
  prefixo `api`, versionamento URI, `ValidationPipe`), e `configureApp`
  mantém a assinatura, sendo agora `applyHttpSetup` +
  `createSwaggerDocument` + `SwaggerModule.setup('docs', …)`. Não
  alterados: `main.ts`, `create-test-app.ts`, `AppModule`, controllers,
  DTOs e o conteúdo do documento. **Prova de byte-identidade**: um spec
  temporário (removido ao final, nunca versionado) reutilizou
  `createTestApp()` offline e capturou o corpo de `GET /docs-json` antes
  de editar e depois da refatoração — **mesmos 1303 bytes e o mesmo
  SHA-256 (`d4135ad9…e310d`), `cmp` byte a byte idêntico**; o HTML de
  `GET /docs` também ficou idêntico (3126 bytes, SHA-256 `20f2dfd8…`).
  O documento é o mesmo que o spike 5.1 havia gerado sem servidor.
  **Testes novos** (offline, sem PostgreSQL/Redis):
  `apps/api/test/configure-app.spec.ts`, 6 testes — o documento de
  `createSwaggerDocument` é igual ao servido em `/docs-json`; título,
  versão, descrição e só os dois paths de health; repetibilidade; e,
  para `applyHttpSetup` sozinho, `x-request-id`, Helmet, prefixo/versão
  funcionando, `/docs` e `/docs-json` **não** montados, e o documento
  ainda criável sem montar nada. Resultados: `api:test:integration`
  **55** testes/14 arquivos (49 anteriores + 6; `swagger.spec.ts`,
  `app-composition.spec.ts`, `security-headers.spec.ts`, `cors.spec.ts`,
  `request-id.spec.ts`, `rate-limit.spec.ts` e `problem-details.spec.ts`
  inalterados e verdes, ou seja, a ordem dos middlewares não mudou de
  forma observável), `api:test` **192** (inalterado), `api:typecheck`,
  `api:lint`, `yarn format:check`, `git diff --check` e `yarn validate`
  aprovados. Nenhuma dependência, `yarn.lock`, Dockerfile, gerador,
  `openapi.json` ou alvo `contract:*` tocados.
- **5.5 — Documentar Problem Details, headers e `operationId`s**:
  `Completed` — aprovada (D9–D12). Muda **somente o documento OpenAPI**;
  o comportamento em runtime (status, corpo, headers, ordem de
  middlewares, filtro) não mudou — `ProblemDetailsFilter`,
  `request-id.ts`, `health.service.ts`, DTOs de health, `AppModule`,
  `main.ts` e `create-test-app.ts` intocados, e os testes HTTP
  existentes (`health.spec.ts`, `problem-details.spec.ts`,
  `request-id.spec.ts`, `rate-limit.spec.ts`, `cors.spec.ts`,
  `security-headers.spec.ts` e demais) passaram **sem edição**. Código
  novo: `ProblemDetailsDto`
  (`apps/api/src/common/dto/problem-details-response.dto.ts`, espelha
  `ProblemDetailsBody` via `implements`; `code` com enum derivado das
  chaves de `PROBLEM_CATALOG`; `errors` opcional com valores
  `string[]`; todo `@ApiProperty` com `type`/`enum` explícito);
  `ApiProblemResponse(status, descrição)`
  (`api-problem-response.decorator.ts`: `@ApiResponse` **somente com
  `content` `application/problem+json` + `$ref`** e
  `@ApiExtraModels(ProblemDetailsDto)`, nunca `type` junto com
  `content`, sem `@ApiProduces`); `api-request-id.decorator.ts` com a
  definição única do `X-Request-Id` (`REQUEST_ID_RESPONSE_HEADERS` e
  `ApiRequestIdHeader()`, usando `REQUEST_ID_PATTERN.source` do
  middleware, sem repetir o regex); `health.controller.ts` com
  `@ApiOperation` (`operationId` e `summary`); `swagger.ts` com
  `info.description` = `Mockp platform REST API.` (título e versão
  inalterados). **Documento resultante** (`/docs-json`, 4977 bytes,
  SHA-256 `09b1faa37de6bdbd30b31043c91174c6a7e6807fa39415f9f45359713fb61ce8`,
  capturado por spec temporário removido ao final; antes, na 5.4, eram
  1303 bytes): exatamente 2 paths — `GET /api/v1/health/live`
  (`operationId` `health_live`; respostas `200` `application/json`
  `HealthLiveResponseDto` e `500` `application/problem+json`
  `ProblemDetailsDto`) e `GET /api/v1/health/ready` (`health_ready`;
  `200` `HealthReadyResponseDto`, `503` `SERVICE_UNAVAILABLE` sem
  `checks` e `500`, ambas `application/problem+json`); `X-Request-Id`
  como header de **todas** as respostas (`string`, `maxLength` 128,
  `pattern` `^[A-Za-z0-9_-]{1,128}$`) e como parâmetro de request
  opcional (`in: header`, `required: false`) nas duas operações;
  nenhum `400`, `404` nem `429`; schemas `ProblemDetailsDto`,
  `HealthLiveResponseDto`, `HealthReadyChecksDto` e
  `HealthReadyResponseDto`. As condições de parada não dispararam:
  `content` + `headers` renderizaram como no spike e os `operationId`
  explícitos saíram sem sufixo de versão. **Testes**:
  `apps/api/test/swagger.spec.ts` estendido (3 → 11 testes: conjunto
  exato de status por operação, content types e `$ref`, `200` em
  `application/json`, `X-Request-Id`, `operationId` exatos, `info`
  exato, dois paths, schema de Problem Details e ausência de
  `400`/`404`/`429`), `apps/api/test/configure-app.spec.ts` ajustado
  só na descrição antiga, e novo
  `apps/api/src/common/dto/problem-details-response.dto.spec.ts` (3
  testes: espelho de tipos com `ProblemDetailsBody`, enum de `code` =
  chaves de `PROBLEM_CATALOG`, tipo explícito em toda propriedade).
  Resultados: `api:test:integration` **63** testes/14 arquivos (55 + 8),
  `api:test` **195** (192 + 3), `api:typecheck`, `api:lint`,
  `yarn format:check`, `git diff --check` e `yarn validate` aprovados.
  Nenhuma dependência, `yarn.lock`, Dockerfile, gerador, `openapi.json`
  ou alvo `contract:*` tocados.
- **5.6 — Gerador determinístico e `api:contract:generate`**: `Pending`
  (D3–D5). Gerador em `apps/api/src/contract/`, **compilado pelo
  `api:build` (tsc, com `emitDecoratorMetadata`) e executado com `node`
  sobre `dist` — nunca com `tsx`** (D3, opção B); os alvos de contrato
  da API dependem de `build`. `NestFactory.create(…, { logger: false,
preview: true })` com config sintética fixa; serialização canônica
  (D4); primeiro `openapi.json` versionado; `.prettierignore` e
  `.gitattributes`. Testes: zero sockets; determinismo byte a byte;
  equivalência com o `/docs-json`, **verificando explicitamente que o
  transformador do Vitest também injeta as dependências** nesse teste
  (o spike mediu só o `tsx`/esbuild).
- **5.7 — `api:contract:check` (somente leitura)**: `Pending`.
  Comparação de bytes em memória, `cache: false`, testes permanentes de
  drift e de não escrita (D17).
- **5.8 — Tipos gerados e `api-client:contract:generate`/`check`**:
  `Pending` (D2, D7, D18). `schema.d.ts` versionado; o script de
  geração dos tipos usa `import` (`.mjs`), porque o `openapi-typescript`
  só carrega via `require(esm)`; `contract:generate` da raiz encadeia a
  API e depois a lib.
- **5.9 — Cliente `openapi-fetch`**: `Pending` (D13).
  `createApiClient({ baseUrl, fetch? })`, testes com `fetch` injetado e
  testes de tipo.
- **5.10 — `contract:check` em `yarn validate`**: `Pending` (D16).
  Acrescentado ao `validate:nx`; hook inalterado; `contract:generate`
  fora do caminho.
- **5.11 — Validação integrada**: `Pending`. `yarn validate` sem cache,
  `yarn validate:infra`, `contract:generate` duas vezes sem diff,
  rebuild das imagens, `/docs-json` do container igual ao
  `openapi.json`, e a prova pontual de drift em cópia descartável fora
  do repositório (autorização própria).
- **5.12 — Fechamento documental**: `Pending`. Roadmap, README, AGENTS,
  `TARGET_ARCHITECTURE.md` (§6 e §13) e ADR 009 (`Accepted`) na mesma
  alteração.

**Decisões** (numeração do plano técnico aprovado; não existe D6):

| ID  | Decisão                                                                                                                                       | Estado                                                                          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| D1  | `openapi.json` em `libs/api-client/openapi/openapi.json`                                                                                      | Aprovada                                                                        |
| D2  | Tipos em `libs/api-client/src/generated/schema.d.ts` + verificação anti-`skipLibCheck` (medida no spike; repetir na 5.8)                      | Aprovada                                                                        |
| D3  | Gerador em `apps/api/src/contract/`, compilado pelo `api:build` e executado com `node` sobre `dist` (nunca `tsx`); `preview: true` confirmado | Aprovada; alterada pelo spike 5.1 (opção B)                                     |
| D4  | Chaves ordenadas, arrays preservados, 2 espaços, LF, `\n` final                                                                               | Aprovada                                                                        |
| D5  | `.prettierignore` + `.gitattributes` (`eol=lf`) para os artefatos                                                                             | Aprovada                                                                        |
| D7  | Warning de peer (`typescript ^5.x` × 6.0.3) aceito como exceção documentada na ADR 009; gatilho de revisão                                    | Exceção concedida (spike 5.1); na 5.2 o aviso no workspace é `YN0002`           |
| D8  | Versões exatas; `openapi-typescript` devDependency, `openapi-fetch` dependency de `libs/api-client`                                           | Aprovada e gravada na 5.2 (`openapi-typescript` 7.13.0, `openapi-fetch` 0.17.0) |
| D9  | `ProblemDetailsDto` único; erros só com `content` (nunca `type` + `content`), sem `@ApiProduces`                                              | Aprovada                                                                        |
| D10 | `live`: 200+500; `ready`: 200+503+500                                                                                                         | Aprovada                                                                        |
| D11 | `X-Request-Id` em todas as respostas e opcional no request (confirmado no Swagger 11.4.7)                                                     | Aprovada                                                                        |
| D12 | `operationId` explícitos (`health_live`/`health_ready`, substituem `HealthController_live_v1`) e descrição atualizada                         | Aprovada                                                                        |
| D13 | `createApiClient({ baseUrl, fetch? })` + re-exports de tipos                                                                                  | Aprovada                                                                        |
| D14 | Decisões registradas na ADR 009 (`Proposed`; `Accepted` no fechamento)                                                                        | Aprovada                                                                        |
| D15 | Dockerfiles ajustados na 5.3, imediata e no mesmo commit da 5.2                                                                               | Aprovada                                                                        |
| D16 | `contract:check` em `validate:nx`; `contract:generate` fora de validate/hook/CI                                                               | Aprovada                                                                        |
| D17 | Provas permanentes (puras, fs observado, módulo descartável) + prova pontual na 5.11                                                          | Aprovada                                                                        |
| D18 | `libs/api-client` em CommonJS como `libs/queue`; script de geração em `.mjs` (`openapi-typescript` só via `require(esm)`)                     | Condição atendida (spike 5.1)                                                   |

`contract:generate` (escreve os artefatos versionados, execução
explícita) e `contract:check` (somente leitura: compara e falha) são
estritamente separados; `contract:check` começa com `cache: false`. O
`tsconfig.json` raiz não será alterado (a lacuna histórica de
`worker`/`queue` não é necessária a esta fase).

**Entregáveis**:

- Script de geração determinística de `openapi.json` a partir da API.
- `openapi.json` versionado no repositório.
- Geração de tipos via `openapi-typescript` em `libs/api-client`.
- Cliente base configurado com `openapi-fetch`.
- Targets Nx `contract:generate` e `contract:check` (o segundo falha o
  pipeline se o contrato ou o cliente gerado estiverem desatualizados).

**Validações**:

- Duas execuções sucessivas da geração produzem o mesmo `openapi.json`
  byte a byte (determinismo).
- `libs/api-client` compila sem erros de tipo.
- Alterar um DTO da API sem regenerar o cliente faz `contract:check`
  falhar.

**Critérios de aceite**:

- Nenhum tipo de DTO é duplicado manualmente no frontend.
- Processo de geração documentado e reproduzível localmente.

---

## Fase 6 — Tailwind, libs/ui e Storybook

**Status**: Pending

**Objetivo**: estabelecer `libs/ui` como design system isolado e
documentado, **antes** de existir o app Next.js, para que este último
apenas consuma componentes já prontos (sem dependência circular entre
frontend e design system).

**Entregáveis**:

- Design tokens (cor, tipografia, espaçamento, radius, sombras e
  breakpoints) criados **dentro de `libs/ui`**, que é a lib proprietária
  desses tokens — `libs/config` não contém e não passa a conter design
  tokens (ver [docs/TARGET_ARCHITECTURE.md](TARGET_ARCHITECTURE.md),
  seções 5 e 9).
- Tailwind CSS configurado a partir desses tokens, com `libs/ui`
  exportando o CSS/tokens resultantes para consumo por `apps/web`.
- `libs/ui` com um conjunto mínimo de componentes-base (atoms/molecules)
  usando Tailwind CSS e Tabler Icons.
- Storybook configurado, renderizando os componentes-base.

**Validações**:

- Storybook builda e roda localmente sem erros.
- Nenhum componente de `libs/ui` importa API, Auth.js, TanStack Query,
  configuração server-only ou tipos de domínio.
- Nenhum design token está definido em `libs/config`.

**Critérios de aceite**:

- Componentes-base e design tokens de `libs/ui` documentados no
  Storybook e prontos para serem consumidos por `apps/web` na Fase 7,
  sem nenhum ajuste retroativo necessário em `libs/ui` motivado pelo
  frontend.

---

## Fase 7 — App Next.js e áreas por persona

**Status**: Pending

**Objetivo**: ter o único app Next.js operacional, consumindo a API via
cliente gerado e os componentes de `libs/ui` já criados na Fase 6, com
as quatro áreas de persona como layouts vazios.

**Entregáveis**:

- App `apps/web` com App Router, com Dockerfile próprio (versão de
  imagem-base fixada, usuário não-root quando suportado, sem depender
  de arquivos não copiados ou de `node_modules` do host) — construído e
  validado nesta fase; usado depois pelo profile `full`, cuja execução
  conjunta é validada na Fase 9.
- `apps/web` consome o CSS/tokens exportados por `libs/ui` (criados na
  Fase 6) — nenhum design token é redefinido ou duplicado em `apps/web`.
- Áreas `/customer`, `/agent`, `/manager`, `/admin` com layouts vazios,
  compostos a partir de `templates` e componentes de `libs/ui`.
- Página consumindo o endpoint de health da API via `libs/api-client` e
  TanStack Query.
- Configuração client-safe de `libs/config` (configuração de runtime,
  não tokens visuais) consumida pelo app, sem nenhum import do
  entrypoint server-only.

**Validações**:

- A imagem do Dockerfile de `apps/web` builda com sucesso, e o app
  inicia corretamente a partir dessa imagem.
- `nx serve web` sobe o app localmente.
- Página de health exibe o estado retornado pela API em tempo real.
- Nenhuma das quatro áreas de persona contém lógica de negócio ainda.
- Nenhum import de configuração server-only presente em `apps/web`.
- Nenhum design token definido diretamente em `apps/web` fora do que é
  exportado por `libs/ui`.

**Critérios de aceite**:

- Estrutura feature-first e Atomic Design aplicada conforme seção 5 de
  [docs/TARGET_ARCHITECTURE.md](TARGET_ARCHITECTURE.md), consumindo
  `libs/ui` sem exigir mudanças nessa lib.

---

## Fase 8 — Adapters Stripe e Mapbox em sandbox

**Status**: Pending

**Objetivo**: implementar adapters técnicos funcionais para Stripe e
Mapbox, validados por smoke tests contra ambientes de teste, sem
nenhuma jornada de negócio (checkout, pagamento, mapa de imóveis).

**Entregáveis**:

- Adapter de Stripe: cliente configurado exclusivamente com chave em
  test mode; validação explícita que rejeita (falha rápida) qualquer
  chave em modo live em ambiente de desenvolvimento ou de testes.
- Adapter de Mapbox: operação técnica controlada (ex.: geocodificação de
  um endereço fixo de teste), sem tela de mapa.
- Configuração de secrets via `libs/config` (entrypoint server-only para
  `STRIPE_SECRET_KEY` e tokens secretos de Mapbox; token público de
  Mapbox acessível também ao client-safe/frontend).
- Testes com mocks para Stripe e Mapbox na suíte padrão (sem rede).
- Testes de sandbox opt-in (rede real), habilitados apenas quando
  secrets locais ou de CI estiverem presentes.

**Validações**:

- Suíte padrão passa sem qualquer chamada de rede a Stripe ou Mapbox.
- Testes de sandbox opt-in passam quando executados com secrets de
  teste válidos.
- Tentativa de inicializar o adapter Stripe com uma chave live em
  desenvolvimento/teste falha explicitamente.
- Nenhum secret aparece versionado no repositório.

**Critérios de aceite**:

- Adapters funcionam de ponta a ponta contra os ambientes de teste dos
  respectivos provedores, sem qualquer jornada de negócio construída
  sobre eles.

---

## Fase 9 — Validação integrada do skeleton

**Status**: Pending

**Objetivo**: confirmar que o skeleton completo atende a todos os
critérios de "primeira entrega" definidos em
[docs/PRODUCT_CONTEXT.md](PRODUCT_CONTEXT.md), incluindo os dois
profiles do Docker Compose. **Esta fase não é a primeira validação dos
Dockerfiles individuais** — cada um já foi construído e validado
isoladamente na fase em que foi criado (API na Fase 3, worker na
Fase 4, web na Fase 7); aqui valida-se apenas a **execução conjunta**
desses três containers no profile `full`.

**Entregáveis**:

- `docker-compose.yml` com o **profile `full`** finalizado, reunindo os
  Dockerfiles de API, worker e web já criados e validados
  individualmente nas fases anteriores, além de PostGIS e Redis, com
  versões fixadas, health checks, volumes nomeados e usuário não-root
  quando suportado.
- Checklist de validação executado de ponta a ponta em ambiente local
  limpo, para **ambos os profiles** (padrão e `full`).

**Validações** (todas devem passar simultaneamente):

- Yarn e Nx configurados.
- API, web e worker iniciam.
- Profile padrão do Docker Compose (PostGIS e Redis) sobe com sucesso.
- Profile `full` do Docker Compose (API, worker, web, PostGIS, Redis)
  sobe com sucesso, com todos os health checks passando.
- Migration e seed funcionam.
- Liveness e readiness funcionam, com readiness verificando
  PostgreSQL/PostGIS e Redis.
- Correlation ID (`X-Request-Id`) é gerado, validado, ecoado na
  resposta e propagado até os jobs BullMQ originados de uma requisição.
- Catálogo mínimo de Problem Details (`VALIDATION_ERROR`,
  `INTERNAL_SERVER_ERROR`, `RATE_LIMIT_EXCEEDED`, `SERVICE_UNAVAILABLE`,
  `NOT_FOUND`) responde nos cenários esperados, com `type` em formato de
  URI-reference estável.
- Rate limiting está ativo nos endpoints de negócio e isento em
  liveness, readiness, Swagger UI e `/docs-json`.
- BullMQ processa o job técnico `system.ping` via o smoke target
  interno (sem endpoint HTTP público).
- Swagger gera OpenAPI determinístico.
- O cliente REST gerado compila.
- O Next consome o health usando o cliente REST e TanStack Query.
- Storybook renderiza os componentes-base e os design tokens
  proprietários de `libs/ui`.
- As quatro áreas por persona possuem layouts vazios.
- Adapters de Stripe (test mode) e Mapbox (operação técnica controlada)
  funcionam contra os respectivos ambientes de teste.
- Suíte padrão de testes passa sem dependência de rede externa.
- Não existe nenhuma dependência de GraphQL no repositório.
- Todos os targets Nx obrigatórios passam: `format:check`, `lint`,
  `typecheck`, `test`, `test:integration`, `contract:generate`,
  `contract:check`, `build`.

**Critérios de aceite**:

- Todos os itens acima verificados e registrados como concluídos antes
  de qualquer fase de implementação de jornadas de negócio ser iniciada.
