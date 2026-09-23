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

**Fase 3 — Docker, PostGIS, Redis e Prisma**: `In Progress`. As
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
está `In Progress`**. O planejamento arquitetural está **concluído e
aprovado**: [ADR 008](adr/008-runtime-persistence-and-repositories.md)
está `Accepted`. A Tarefa 3.3 é executada subtarefa por subtarefa
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
já existem no código e já estão importados em `AppModule`. Nenhum dos
dois (Prisma/Redis) ainda representa readiness real — isso continua
sendo exclusivamente a Tarefa 3.4; nenhum Dockerfile da API existe
ainda. 132 testes unitários, 44 testes de integração offline e 23
testes de integração com infraestrutura real confirmados ao final da
3.3.6. **A subtarefa 3.3.7** (`PropertyRepository`/`PropertiesModule`,
ADR 008 §4.3) é a próxima da sequência: o planejamento e a revisão
técnica do plano já foram concluídos, mas **a implementação continua
bloqueada até autorização explícita e separada do responsável pelo
projeto**. **A subtarefa 3.3.8 não foi iniciada e continua
bloqueada**. **As Tarefas 3.4 a 3.6 continuam bloqueadas** — cada uma
só inicia depois que a anterior atender seus critérios de aceite. As
Fases 0, 1 e 2 estão `Completed`.

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

**Status**: In Progress — Tarefa 3.0 (abertura documental e
especificação técnica), Tarefa 3.1 (Docker Compose com PostGIS e
Redis) e **Tarefa 3.2** (Prisma, schema, migration inicial e seed)
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
independente aprovou o resultado (ver "3.2" abaixo). Nenhum repository
ou Dockerfile da API foi criado ainda; readiness (`a API ainda checa
apenas sua própria inicialização`) permanece exclusivamente Tarefa 3.4.
**A Tarefa 3.3 está `In Progress`**. Planejamento arquitetural
**concluído e aprovado**:
[ADR 008](adr/008-runtime-persistence-and-repositories.md) está
`Accepted`. **As subtarefas 3.3.1 a 3.3.6 estão `Completed` e
aprovadas** — ver "3.3" abaixo para o detalhamento de cada uma. **A
subtarefa 3.3.7** (`PropertyRepository`/`PropertiesModule`) teve seu
planejamento e revisão técnica concluídos, mas **a implementação
continua bloqueada até autorização explícita e separada**; **a
subtarefa 3.3.8 não foi iniciada e continua bloqueada**. **As Tarefas
3.4 a 3.6 continuam bloqueadas** — cada uma só inicia depois que a
anterior atender seus critérios de aceite.

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
  repository. **`In Progress`** (Tarefa 3.2 concluída). Planejamento
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
    offline abre socket real, e sua existência **não representa
    readiness real** (isso continua sendo exclusivamente a Tarefa 3.4).
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
    existência **não representa readiness real** (isso continua sendo
    exclusivamente a Tarefa 3.4).
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
    **planejamento e revisão técnica do plano concluídos** — a
    implementação **continua bloqueada até autorização explícita e
    separada** do responsável pelo projeto; concluir o planejamento e a
    revisão não substitui essa autorização.
  - **3.3.8 — Validação integrada e fechamento posterior**: **não
    iniciada, bloqueada** até a 3.3.7 ser implementada e aprovada.
- **3.4 — Readiness real e testes de falha das dependências**:
  atualizar `GET /api/v1/health/ready` para checar PostgreSQL/PostGIS e
  Redis; testes de integração cobrindo o caminho feliz e a falha de
  cada dependência (`503` + `code: SERVICE_UNAVAILABLE`).
- **3.5 — Dockerfile da API**: criado **depois** de Prisma estar
  integrado (3.2/3.3), incluindo geração do Prisma Client e migrations
  dentro da imagem, sem depender de `node_modules` do host; builda com
  sucesso e a API inicia a partir da imagem gerada.
- **3.6 — Validação integrada e fechamento documental**: checklist de
  ponta a ponta desta fase (Compose sobe, migration aplica, seed roda,
  readiness reflete falha real, Dockerfile builda e inicia), ADR 006
  permanece `Accepted` (nunca reaberta como `Proposed` sem motivo), e
  atualização de README/roadmap para `Completed` na mesma alteração.

**Entregáveis**:

- `docker-compose.yml` com o **profile padrão**: PostGIS (PostgreSQL
  com extensão PostGIS) e Redis, com health checks e volumes nomeados.
- Dockerfile de `apps/api` (versão de imagem-base fixada, usuário
  não-root quando suportado, sem depender de arquivos não copiados ou
  de `node_modules` do host) — construído e validado nesta fase; usado
  depois pelo profile `full`, cuja execução conjunta é validada na
  Fase 9.
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
- `GET /api/v1/health/ready` atualizado para verificar PostgreSQL/
  PostGIS e Redis (substituindo a checagem apenas de inicialização da
  Fase 2); falha de qualquer dependência retorna `503` com Problem
  Details e `code: SERVICE_UNAVAILABLE`.

**Validações**:

- `docker compose up` (profile padrão) sobe PostGIS e Redis com
  sucesso, com health checks passando.
- A imagem do Dockerfile de `apps/api` builda com sucesso, e a API
  inicia corretamente a partir dessa imagem (não apenas via `nx serve`).
- Migration aplica sem erros em ambiente limpo.
- Seed roda de forma idempotente e determinística.
- Índice GiST presente na coluna geoespacial de `Address`.
- Derrubar PostgreSQL ou Redis faz `GET /api/v1/health/ready` responder
  `503` com `code: SERVICE_UNAVAILABLE`.

**Critérios de aceite**:

- Modelo de dados conforme seção 10 de
  [docs/TARGET_ARCHITECTURE.md](TARGET_ARCHITECTURE.md) e a
  [ADR 007](adr/007-multi-tenant-workspace-foundation.md) (autoridade
  da modelagem), sem nenhuma entidade de negócio fora do núcleo
  revisado. Infraestrutura, Prisma/configuração e pipeline continuam
  conforme a [ADR 006](adr/006-persistence-and-local-infrastructure.md).
- Readiness da API passa a refletir a saúde real das dependências
  (PostgreSQL/PostGIS e Redis).

---

## Fase 4 — Worker e BullMQ

**Status**: Pending

**Objetivo**: validar a separação entre API e worker através de um job
puramente técnico, sem expor esse fluxo via HTTP.

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

**Status**: Pending

**Objetivo**: fechar o ciclo de contrato determinístico entre backend e
frontend.

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
