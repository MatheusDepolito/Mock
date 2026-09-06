# ADR 006 — Persistência (Prisma + PostGIS) e infraestrutura local (Docker Compose)

## Status

Accepted

## Contexto

A Fase 3 ([docs/IMPLEMENTATION_ROADMAP.md](../IMPLEMENTATION_ROADMAP.md))
provisiona a primeira infraestrutura externa do Mockp (PostgreSQL/PostGIS
e Redis) e o núcleo de dados inicial via Prisma, conforme decidido em
[docs/TARGET_ARCHITECTURE.md](../TARGET_ARCHITECTURE.md) (seções 9, 10 e 12) e nas camadas definidas em [ADR 002](002-backend-layers.md). Antes de
instalar qualquer dependência ou criar `docker-compose.yml`/
`schema.prisma`, era necessário fechar, em um único documento revisável,
todas as decisões técnicas que afetam a forma final do schema, dos
containers e dos comandos operacionais — para que a implementação (3.1 a
3.6) não precise decidir nada estrutural ad-hoc no meio do código.

Uma primeira versão deste documento deixava algumas escolhas técnicas
sem número/valor definitivo, a serem preenchidas só durante a
implementação. Esta revisão fecha cada uma delas com um valor concreto:
uma ADR `Proposed` não pode transferir decisão estrutural para quem
implementar as Tarefas 3.1 a 3.5 — só o que genuinamente não afeta a
Fase 3 permanece registrado em "Fora de escopo".

Esta ADR **não implementa nada**: nenhuma dependência é instalada, nenhum
`docker-compose.yml`, `schema.prisma` ou `prisma.config.ts` é criado. Ela
propõe o desenho completo para aprovação do responsável pelo projeto
antes do início da Tarefa 3.1.

## Decisão

### Infraestrutura local (Docker Compose, profile padrão)

- **PostgreSQL 18 com PostGIS 3.6**, imagem `postgis/postgis:18-3.6`
  (tag explícita, nunca `latest`).
- Volume nomeado montado em `/var/lib/postgresql` (não
  `/var/lib/postgresql/data` — PostgreSQL 18 mudou o layout padrão do
  diretório de dados; montar em `/var/lib/postgresql` cobre o novo
  layout sem depender de um subcaminho específico de versão).
- **Redis `redis:8.8.2-alpine`** — tag exata, variante Alpine, nunca
  `latest`.
- **Sem `container_name`** em nenhum serviço — os serviços são
  referenciados pelo nome do serviço no Compose (resolução DNS interna
  da rede do Compose), evitando colisão de nome entre múltiplos
  ambientes locais rodando simultaneamente.
- **Nenhum `profiles:` declarado** em PostgreSQL nem Redis — ambos
  pertencem ao profile padrão (sobem com `docker compose up` sem flag
  de profile), conforme seção 12 de TARGET_ARCHITECTURE.md.
- **O profile `full` não é implementado nesta fase** — permanece
  reservado para quando `api`, `worker` e `web` tiverem Dockerfiles
  próprios (Fases 3, 4 e 7) e for validado em conjunto na Fase 9.
- **Health checks**: PostgreSQL via `pg_isready -U <user> -d <db>`;
  Redis via `redis-cli ping`.
- **Volumes nomeados separados**: um para dados do PostgreSQL, outro
  para dados do Redis — nunca compartilhados, nunca bind mounts
  implícitos ou volumes anônimos.
- **`DATABASE_URL` e `REDIS_URL`** são adicionadas ao schema Zod
  **server-only** existente (`@mockp/config/server`, dentro de
  `ServerConfig`), ao lado das variáveis já validadas na Fase 2 —
  nunca ao entrypoint client-safe (que só passa a existir na Fase 7).
  São **obrigatórias** para o `ServerConfig` validar com sucesso —
  sem elas a API não sobe, em nenhum ambiente, inclusive produção.
- **`TEST_DATABASE_URL` não pertence ao `ServerConfig`** e não é lida
  pelo schema Zod server-only — é uma variável exclusiva de
  testes/scripts, lida diretamente por eles (harness de teste,
  `prisma.test.config.ts`, ver abaixo). A API em produção nunca
  referencia `TEST_DATABASE_URL` e nunca falha ao subir por ela estar
  ausente — ver "Configuração: runtime vs. testes".
- `.env.example` pode conter valores locais **não secretos** para as
  três variáveis (ex.: credenciais padrão de desenvolvimento do
  próprio Compose, apontando para `localhost`); nenhum secret real é
  versionado em nenhuma branch.
- **Criação determinística do banco de testes**: o container
  PostgreSQL cria `mockp` (via `POSTGRES_DB=mockp`) e `mockp_test` no
  primeiro start com volume vazio, através de um script SQL versionado
  em `infra/postgres-init/01-create-test-database.sql` (conteúdo:
  `CREATE DATABASE mockp_test;`), montado no Compose em
  `/docker-entrypoint-initdb.d/` — mecanismo padrão da imagem oficial
  do Postgres (herdado pela imagem `postgis/postgis`) para scripts de
  inicialização executados uma única vez. Nenhuma ação manual é
  necessária: `docker compose up` já deixa os dois bancos prontos.

### Prisma proposto

- **Prisma ORM `7.10.0`** — `prisma`, `@prisma/client` e
  `@prisma/adapter-pg` fixados exatamente em `7.10.0` (sem `^`/`~`,
  seguindo a convenção já usada para NestJS no [ADR 005](005-api-runtime.md)).
  **`prisma` (o CLI) é declarado como `dependency` de
  `apps/api/package.json`, não `devDependency`** — é isso que garante
  que `yarn install --immutable` no stage de build da imagem Docker o
  resolva para `node_modules`, permitindo `migrate deploy` a partir da
  própria imagem final (ver "Dockerfile da API e Prisma"). Prisma
  `7.10.0` declara suporte a Node `>=24`, compatível com a
  versão de Node já usada pelo workspace.
- **Driver `pg` fixado em `8.23.0`**: `@prisma/adapter-pg@7.10.0` aceita
  `pg ^8.16.3`; `8.23.0` satisfaz essa faixa (mesma major, versão
  igual ou superior ao mínimo exigido).
- **Configuração moderna via arquivo `prisma*.config.ts`** (formato
  atual do Prisma 7, substituindo a chave `"prisma"` do
  `package.json`) — **três arquivos**, não um só, para separar o que
  precisa de conexão real do que não precisa (ver "Arquivos de
  configuração Prisma: separação schema-only vs. banco real" abaixo).
  O schema fica em `apps/api/prisma/schema.prisma`, migrations em
  `apps/api/prisma/migrations/`.
- **Generator `prisma-client` com output explícito**: gerado em
  `apps/api/src/generated/prisma-client` (diretório gitignored,
  regenerado por `db:generate`). Este local vale para as Fases 3 **e**
  4 — ver "Prisma Client e fronteira com o worker" abaixo.
- **Acesso ao PostgreSQL via `PrismaPg`** (`@prisma/adapter-pg`), com a
  connection string vinda de `ServerConfig.databaseUrl` (validada pelo
  schema Zod server-only) — não lida diretamente de `process.env`
  dentro do código da aplicação, mantendo o mesmo padrão já usado desde
  a Fase 2 para as demais variáveis.
- **IDs UUID nativos** (`@id @default(uuid()) @db.Uuid`) em todas as
  entidades, exceto onde uma inserção via SQL raw exige geração
  explícita no código (ver "Geração de UUID em inserções raw").
- **Valores monetários em `Decimal`**, nunca `Float`/`Double` — único
  campo monetário do núcleo inicial é `Property.price`.
- **`createdAt`/`updatedAt` em todos os modelos**, incluindo tabelas
  associativas (`UserRole`, `BrokerageMembership`).
- **PostGIS representado como**
  `Unsupported("geography(Point, 4326)")` no schema Prisma (tipo não
  nativamente suportado pelo Prisma Client — leitura/escrita
  geoespacial é feita via SQL parametrizado dentro do
  `PropertyRepository`, nunca com o Client tipado diretamente nesse
  campo).
- **Migration inicial customizada**: a migration gerada por
  `prisma migrate dev --create-only` é editada manualmente para incluir
  `CREATE EXTENSION IF NOT EXISTS postgis;` antes da criação das
  tabelas, e um `CREATE INDEX ... USING GIST (location)` explícito
  sobre `addresses.location` depois da criação da tabela `addresses` —
  o Prisma não gera esse índice sozinho para um tipo `Unsupported`.
- **SQL geoespacial encapsulado no `PropertyRepository`**: todo
  `$queryRaw`/`$executeRaw` relacionado a `Address.location` vive
  exclusivamente nesse repository, sempre como tagged template
  `Prisma.sql` (nunca `$queryRawUnsafe`/`$executeRawUnsafe`, nunca
  interpolação de string) — ver "SQL geoespacial: forma exigida e
  geração de UUID em inserções raw". Nenhum Service ou Controller usa
  `$queryRaw`/`$executeRaw` diretamente.
- **SafeQL não é adicionado nesta fase** — validação estática de SQL
  raw fica para uma futura ADR, se e quando a superfície de SQL raw
  crescer além do encapsulamento atual em `PropertyRepository`.

### Convenção de nomes de tabela e coluna

- Modelos Prisma mantêm PascalCase no schema/Client TypeScript; as
  tabelas físicas usam `@@map` para snake_case plural, e as colunas
  usam `@map` para snake_case: `User → users`,
  `Credential → credentials`, `AuthIdentity → auth_identities`,
  `Role → roles`, `UserRole → user_roles`,
  `CustomerProfile → customer_profiles`,
  `AgentProfile → agent_profiles`, `Brokerage → brokerages`,
  `BrokerageMembership → brokerage_memberships`,
  `Property → properties`, `Address → addresses` (ex.:
  `userId String @map("user_id")`).
- Essa convenção é o que torna possível a lista explícita de tabelas
  usada pela limpeza segura do banco de testes (ver seção dedicada).

### Cliente Redis e verificação de saúde

- **`ioredis@6.0.0`** é o cliente Redis da API — usado nesta fase para
  o indicador de readiness (`PING`) e escolhido deliberadamente por já
  ser o cliente compatível com BullMQ, preparando a compatibilidade
  necessária quando o worker (Fase 4) for criado, sem exigir uma troca
  de biblioteca depois.
- **`@nestjs/terminus` não é introduzido nesta fase**: os indicadores
  de readiness (PostgreSQL e Redis) são implementados como funções
  simples sobre a estrutura `HealthModule`/`HealthService` já existente
  desde a Fase 2 (ver [health.service.ts](../../apps/api/src/health/health.service.ts)),
  sem adicionar uma dependência de health-check framework para dois
  checks diretos.

### Configuração: runtime vs. testes

- **`ServerConfig` (produção/dev)** valida exatamente `DATABASE_URL` e
  `REDIS_URL`, além das variáveis já existentes desde a Fase 2. Nenhuma
  variável de teste entra nesse schema.
- **`TEST_DATABASE_URL`** é lida somente por código de teste/scripts
  (harness de integração, `prisma.test.config.ts`) através de um
  utilitário de configuração de teste próprio (não o `ServerConfig`),
  seguindo o mesmo espírito de separação server-only/entrypoints já
  usado em `@mockp/config`. Iniciar a API (`nx serve api`, ou a imagem
  Docker) nunca exige `TEST_DATABASE_URL` — sua ausência é irrelevante
  fora do contexto de teste.
- Esta separação é o que permite `yarn validate` (que não deve
  depender de Docker) e a suíte de testes de infraestrutura real
  (que depende) coexistirem sem se confundirem — ver "Pipeline de
  `yarn validate` vs. `yarn validate:infra`" abaixo.

### Entidades permitidas (núcleo revisado)

Exatamente as 11 entidades de
[docs/TARGET_ARCHITECTURE.md](../TARGET_ARCHITECTURE.md) (seção 10):
`User`, `Credential`, `AuthIdentity`, `Role`, `UserRole`,
`CustomerProfile`, `AgentProfile`, `Brokerage`, `BrokerageMembership`,
`Property`, `Address`. Nenhuma outra entidade (`Inquiry`, `Timeline`,
`Review`, `Verification`, `PropertyFeature`, `Payment`, `RefreshToken`
ou qualquer outra) é criada nesta fase.

Os modelos abaixo são um **desenho mínimo estrutural**, com exceção dos
atributos profissionais de `AgentProfile`, que TARGET_ARCHITECTURE.md
(seção 10) exige explicitamente e por isso são incluídos já nesta
revisão. Nenhum outro campo de jornada de negócio futura (perfil de
`customer`, verificação, preferências, etc.) é incluído.

#### `User`

| Campo       | Tipo Prisma/PostgreSQL        | Obrigatório | Default      | Único | Relacionamento | onDelete | Justificativa                                                                                                |
| ----------- | ----------------------------- | ----------- | ------------ | ----- | -------------- | -------- | ------------------------------------------------------------------------------------------------------------ |
| `id`        | `String @id @db.Uuid`         | Sim         | `uuid()`     | PK    | —              | —        | Identificador estável, independente de dado de negócio                                                       |
| `email`     | `String @db.Text`             | Sim         | —            | Sim   | —              | —        | Identidade de login canônica; normalização (lowercase/trim) ocorre na camada de aplicação antes de persistir |
| `createdAt` | `DateTime @db.Timestamptz(3)` | Sim         | `now()`      | Não   | —              | —        | Auditoria, padrão em todos os modelos                                                                        |
| `updatedAt` | `DateTime @db.Timestamptz(3)` | Sim         | `@updatedAt` | Não   | —              | —        | Auditoria, padrão em todos os modelos                                                                        |

Relações (lado 1 de `User`, FK vive na entidade filha): `Credential`
(1:1, opcional no sentido de que nem todo `User` precisa ter uma —
ver "Criação de usuários" abaixo), `AuthIdentity` (1:N), `UserRole`
(1:N), `CustomerProfile` (1:1 opcional), `AgentProfile` (1:1 opcional),
`BrokerageMembership` (1:N). `User` **não** é mais referenciado
diretamente por `Property` — o agente responsável é referenciado via
`AgentProfile` (ver `Property.responsibleAgentId` abaixo).

#### `Credential`

| Campo          | Tipo                          | Obrigatório | Default      | Único     | Relacionamento | onDelete  | Justificativa                                                  |
| -------------- | ----------------------------- | ----------- | ------------ | --------- | -------------- | --------- | -------------------------------------------------------------- |
| `id`           | `String @id @db.Uuid`         | Sim         | `uuid()`     | PK        | —              | —         | —                                                              |
| `userId`       | `String @db.Uuid`             | Sim         | —            | Sim (1:1) | `User`         | `Cascade` | Credencial não tem sentido sem o usuário dono                  |
| `passwordHash` | `String @db.Text`             | Sim         | —            | Não       | —              | —         | Nunca a senha em texto plano; único dado sensível desta tabela |
| `createdAt`    | `DateTime @db.Timestamptz(3)` | Sim         | `now()`      | Não       | —              | —         | —                                                              |
| `updatedAt`    | `DateTime @db.Timestamptz(3)` | Sim         | `@updatedAt` | Não       | —              | —         | Atualiza quando a senha é trocada                              |

`Credential` é **opcional no lado de `User`** (nem todo usuário possui
uma linha em `Credential`) — ver "Criação de usuários e autenticação
futura" abaixo: um usuário criado via OAuth (`AuthIdentity`) **não
nasce** com `Credential`, mas nada no modelo impede que uma
`Credential` seja vinculada a ele depois (ex.: o usuário decide
adicionar uma senha a uma conta que começou só com login social) — essa
operação de vínculo posterior não é implementada nesta fase, apenas não
é estruturalmente bloqueada pelo schema.

#### `AuthIdentity`

| Campo               | Tipo                          | Obrigatório | Default      | Único     | Relacionamento | onDelete  | Justificativa                                                                          |
| ------------------- | ----------------------------- | ----------- | ------------ | --------- | -------------- | --------- | -------------------------------------------------------------------------------------- |
| `id`                | `String @id @db.Uuid`         | Sim         | `uuid()`     | PK        | —              | —         | —                                                                                      |
| `userId`            | `String @db.Uuid`             | Sim         | —            | Não       | `User`         | `Cascade` | Identidade externa pertence a um usuário; um usuário pode ter mais de um provider      |
| `provider`          | `String @db.Text`             | Sim         | —            | Composto* | —              | —         | String livre (não enum) para não exigir migration a cada novo provider OAuth suportado |
| `providerAccountId` | `String @db.Text`             | Sim         | —            | Composto* | —              | —         | Id da conta no provedor externo                                                        |
| `createdAt`         | `DateTime @db.Timestamptz(3)` | Sim         | `now()`      | Não       | —              | —         | —                                                                                      |
| `updatedAt`         | `DateTime @db.Timestamptz(3)` | Sim         | `@updatedAt` | Não       | —              | —         | —                                                                                      |

\* Unicidade composta: `@@unique([provider, providerAccountId])`.

#### `Role`

| Campo       | Tipo                          | Obrigatório | Default                                 | Único | Relacionamento | onDelete | Justificativa                                |
| ----------- | ----------------------------- | ----------- | --------------------------------------- | ----- | -------------- | -------- | -------------------------------------------- |
| `id`        | `String @id @db.Uuid`         | Sim         | `uuid()` (fixo via seed, não aleatório) | PK    | —              | —        | Catálogo determinístico — populado pelo seed |
| `name`      | `RoleName` (enum)             | Sim         | —                                       | Sim   | —              | —        | Catálogo fechado dos 4 papéis globais        |
| `createdAt` | `DateTime @db.Timestamptz(3)` | Sim         | `now()`                                 | Não   | —              | —        | —                                            |
| `updatedAt` | `DateTime @db.Timestamptz(3)` | Sim         | `@updatedAt`                            | Não   | —              | —        | —                                            |

Enum `RoleName { CUSTOMER AGENT MANAGER ADMIN }` — os 4 papéis globais
cumulativos definidos em [ADR 004](004-auth-ownership.md).

#### `UserRole`

| Campo       | Tipo                          | Obrigatório | Default      | Único     | Relacionamento | onDelete   | Justificativa                                                             |
| ----------- | ----------------------------- | ----------- | ------------ | --------- | -------------- | ---------- | ------------------------------------------------------------------------- |
| `id`        | `String @id @db.Uuid`         | Sim         | `uuid()`     | PK        | —              | —          | —                                                                         |
| `userId`    | `String @db.Uuid`             | Sim         | —            | Composto* | `User`         | `Cascade`  | Atribuição de papel deixa de existir quando o usuário é removido          |
| `roleId`    | `String @db.Uuid`             | Sim         | —            | Composto* | `Role`         | `Restrict` | Catálogo de papéis não deve ser apagável enquanto houver atribuição ativa |
| `createdAt` | `DateTime @db.Timestamptz(3)` | Sim         | `now()`      | Não       | —              | —          | —                                                                         |
| `updatedAt` | `DateTime @db.Timestamptz(3)` | Sim         | `@updatedAt` | Não       | —              | —          | —                                                                         |

\* Unicidade composta: `@@unique([userId, roleId])` — permite papéis
cumulativos (várias linhas por `userId`), mas nunca o mesmo papel
duplicado para o mesmo usuário.

#### `CustomerProfile`

| Campo       | Tipo                          | Obrigatório | Default      | Único     | Relacionamento | onDelete  | Justificativa                   |
| ----------- | ----------------------------- | ----------- | ------------ | --------- | -------------- | --------- | ------------------------------- |
| `id`        | `String @id @db.Uuid`         | Sim         | `uuid()`     | PK        | —              | —         | —                               |
| `userId`    | `String @db.Uuid`             | Sim         | —            | Sim (1:1) | `User`         | `Cascade` | Perfil não existe sem o usuário |
| `createdAt` | `DateTime @db.Timestamptz(3)` | Sim         | `now()`      | Não       | —              | —         | —                               |
| `updatedAt` | `DateTime @db.Timestamptz(3)` | Sim         | `@updatedAt` | Não       | —              | —         | —                               |

Permanece estrutural nesta fase: nenhum atributo de jornada de
`customer` (preferências, favoritos, etc.) foi aprovado ainda. A tabela
existe apenas para materializar o papel como perfil dedicado, conforme
seção 10 de TARGET_ARCHITECTURE.md. Isto é uma decisão fechada desta
ADR, não uma questão em aberto.

#### `AgentProfile`

| Campo           | Tipo                          | Obrigatório | Default      | Único     | Relacionamento | onDelete  | Justificativa                                                                                          |
| --------------- | ----------------------------- | ----------- | ------------ | --------- | -------------- | --------- | ------------------------------------------------------------------------------------------------------ |
| `id`            | `String @id @db.Uuid`         | Sim         | `uuid()`     | PK        | —              | —         | —                                                                                                      |
| `userId`        | `String @db.Uuid`             | Sim         | —            | Sim (1:1) | `User`         | `Cascade` | Perfil não existe sem o usuário                                                                        |
| `licenseNumber` | `String @db.Text`             | Sim         | —            | Composto* | —              | —         | Registro profissional do corretor — atributo profissional exigido por TARGET_ARCHITECTURE.md, seção 10 |
| `licenseState`  | `String @db.Text`             | Sim         | —            | Composto* | —              | —         | Unidade federativa/jurisdição do registro; o mesmo número pode existir em jurisdições diferentes       |
| `createdAt`     | `DateTime @db.Timestamptz(3)` | Sim         | `now()`      | Não       | —              | —         | —                                                                                                      |
| `updatedAt`     | `DateTime @db.Timestamptz(3)` | Sim         | `@updatedAt` | Não       | —              | —         | —                                                                                                      |

\* Unicidade composta: `@@unique([licenseState, licenseNumber])`.
`licenseNumber` e `licenseState` são normalizados para
uppercase/trim na camada de aplicação (mesmo padrão já usado para
`User.email` desde a Fase 2) antes de persistir, para que a unicidade
composta não seja burlada por diferença de caixa/espaço. **Nenhuma
coluna `verified`** é criada — verificação de corretor está fora do
modelo inicial (seção 10 de TARGET_ARCHITECTURE.md).

#### `Brokerage`

| Campo       | Tipo                          | Obrigatório | Default      | Único | Relacionamento | onDelete | Justificativa                                                                                                                                  |
| ----------- | ----------------------------- | ----------- | ------------ | ----- | -------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`        | `String @id @db.Uuid`         | Sim         | `uuid()`     | PK    | —              | —        | —                                                                                                                                              |
| `name`      | `String @db.Text`             | Sim         | —            | Não   | —              | —        | Nome comercial; duas corretoras podem legitimamente ter o mesmo nome fantasia em regiões diferentes — unicidade não é forçada no núcleo mínimo |
| `createdAt` | `DateTime @db.Timestamptz(3)` | Sim         | `now()`      | Não   | —              | —        | —                                                                                                                                              |
| `updatedAt` | `DateTime @db.Timestamptz(3)` | Sim         | `@updatedAt` | Não   | —              | —        | —                                                                                                                                              |

#### `BrokerageMembership`

| Campo         | Tipo                          | Obrigatório | Default      | Único     | Relacionamento | onDelete  | Justificativa                                                                    |
| ------------- | ----------------------------- | ----------- | ------------ | --------- | -------------- | --------- | -------------------------------------------------------------------------------- |
| `id`          | `String @id @db.Uuid`         | Sim         | `uuid()`     | PK        | —              | —         | —                                                                                |
| `userId`      | `String @db.Uuid`             | Sim         | —            | Composto* | `User`         | `Cascade` | Vínculo não existe sem o usuário                                                 |
| `brokerageId` | `String @db.Uuid`             | Sim         | —            | Composto* | `Brokerage`    | `Cascade` | Vínculo não existe sem a corretora                                               |
| `role`        | `BrokerageMemberRole` (enum)  | Sim         | —            | Composto* | —              | —         | Papel do usuário **dentro** da corretora, distinto do papel global em `UserRole` |
| `createdAt`   | `DateTime @db.Timestamptz(3)` | Sim         | `now()`      | Não       | —              | —         | —                                                                                |
| `updatedAt`   | `DateTime @db.Timestamptz(3)` | Sim         | `@updatedAt` | Não       | —              | —         | —                                                                                |

\* Unicidade composta: `@@unique([userId, brokerageId, role])` — **não**
a alternativa `@@unique([userId, brokerageId])`: o mesmo usuário pode
ser `AGENT` **e** `MANAGER` na mesma corretora simultaneamente (duas
linhas, uma por papel); a constraint impede apenas a duplicata exata
do mesmo papel para o mesmo par usuário/corretora. Enum
`BrokerageMemberRole { AGENT MANAGER }`.

#### `Property`

| Campo                | Tipo                          | Obrigatório | Default      | Único        | Relacionamento | onDelete   | Justificativa                                                                                                                                                                      |
| -------------------- | ----------------------------- | ----------- | ------------ | ------------ | -------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                 | `String @id @db.Uuid`         | Sim         | `uuid()`     | PK           | —              | —          | —                                                                                                                                                                                  |
| `title`              | `String @db.Text`             | Sim         | —            | Não          | —              | —          | Identificação mínima para listagem/exibição                                                                                                                                        |
| `price`              | `Decimal @db.Decimal(12, 2)`  | Sim         | —            | Não          | —              | —          | `Decimal`, nunca `Float`; precisão 12/escala 2 cobre até 9.999.999.999,99                                                                                                          |
| `responsibleAgentId` | `String @db.Uuid`             | Sim         | —            | Não (índice) | `AgentProfile` | `Restrict` | Todo imóvel exige um agente responsável; FK aponta para `AgentProfile.id` (não `User.id`) — o banco garante por integridade referencial que o responsável possui um `AgentProfile` |
| `brokerageId`        | `String? @db.Uuid`            | Não         | `null`       | Não (índice) | `Brokerage`    | `SetNull`  | Vínculo opcional; remover a corretora não deve apagar o imóvel, apenas desvinculá-lo                                                                                               |
| `createdAt`          | `DateTime @db.Timestamptz(3)` | Sim         | `now()`      | Não          | —              | —          | —                                                                                                                                                                                  |
| `updatedAt`          | `DateTime @db.Timestamptz(3)` | Sim         | `@updatedAt` | Não          | —              | —          | —                                                                                                                                                                                  |

O campo genérico `agentId` (apontando para `User`) foi removido desta
proposta — `responsibleAgentId` aponta exclusivamente para
`AgentProfile.id`, de forma que não é possível persistir um `Property`
cujo responsável não tenha um `AgentProfile` válido: a própria FK do
banco rejeita a inserção.

#### `Address`

| Campo        | Tipo                                    | Obrigatório | Default      | Único     | Relacionamento | onDelete  | Justificativa                                                                         |
| ------------ | --------------------------------------- | ----------- | ------------ | --------- | -------------- | --------- | ------------------------------------------------------------------------------------- |
| `id`         | `String @id @db.Uuid`                   | Sim         | `uuid()`     | PK        | —              | —         | Ver "Geração de UUID em inserções raw" — o default só se aplica a escritas via Client |
| `propertyId` | `String @db.Uuid`                       | Sim         | —            | Sim (1:1) | `Property`     | `Cascade` | Endereço não existe sem o imóvel                                                      |
| `street`     | `String @db.Text`                       | Sim         | —            | Não       | —              | —         | Campo estrutural mínimo de endereço                                                   |
| `city`       | `String @db.Text`                       | Sim         | —            | Não       | —              | —         | —                                                                                     |
| `state`      | `String @db.Text`                       | Sim         | —            | Não       | —              | —         | —                                                                                     |
| `postalCode` | `String @db.Text`                       | Sim         | —            | Não       | —              | —         | —                                                                                     |
| `country`    | `String @db.Text`                       | Sim         | —            | Não       | —              | —         | —                                                                                     |
| `location`   | `Unsupported("geography(Point, 4326)")` | Sim         | —            | Não       | —              | —         | Localização PostGIS, SRID 4326; indexada via GiST criado em SQL de migration          |
| `createdAt`  | `DateTime @db.Timestamptz(3)`           | Sim         | `now()`      | Não       | —              | —         | —                                                                                     |
| `updatedAt`  | `DateTime @db.Timestamptz(3)`           | Sim         | `@updatedAt` | Não       | —              | —         | —                                                                                     |

### Criação de usuários e autenticação futura

`User` não tem uma única forma de criação — `Credential` é opcional no
lado de `User`, e a ADR fixa duas operações distintas em
`UserRepository`, ambas atômicas (uma transação Prisma cada):

- **`createWithCredential(input)`**: cria `User` + `Credential` +
  `UserRole` inicial. Usada pelo fluxo futuro de cadastro por
  e-mail/senha.
- **`createWithAuthIdentity(input)`**: cria `User` + `AuthIdentity` +
  `UserRole` inicial, **sem** criar `Credential`. Usada pelo fluxo
  futuro de login social (Google, ver [ADR 004](004-auth-ownership.md)).
  Isso não impede que o mesmo usuário venha a ter uma `Credential`
  vinculada mais tarde por uma operação futura (fora do escopo desta
  fase) — apenas que a criação inicial via OAuth não inclui uma.

Ambas recebem os papéis iniciais (`RoleName[]`) como **parâmetro
explícito do chamador** — esta ADR não decide qual papel é atribuído
por padrão a um novo usuário; essa é uma regra de negócio da futura
implementação de autenticação (fora do escopo da Fase 3, que não expõe
nenhum endpoint de autenticação). Nenhuma das duas operações é exposta
por endpoint nesta fase — ambas existem apenas como método de
repository, exercitado por teste de integração direto contra o
repository.

### Agregados e repositories

- **`UserRepository`**: `User`, `Credential`, `AuthIdentity`,
  `UserRole`, `CustomerProfile`, `AgentProfile` — incluindo
  `createWithCredential`/`createWithAuthIdentity` acima, e a
  normalização uppercase/trim de `AgentProfile.licenseNumber`/
  `licenseState` antes de persistir.
- **`BrokerageRepository`**: `Brokerage`, `BrokerageMembership`.
- **`PropertyRepository`**: `Property`, `Address`. Criação de um
  `Property` já com seu `Address` (incluindo o SQL parametrizado de
  `location`) é atômica — ver "Geração de UUID em inserções raw".
- **`Role` não tem repository**: é um catálogo determinístico populado
  apenas pelo seed; nenhum caso de uso da aplicação cria, edita ou
  remove `Role` em runtime. Um `RoleRepository` só seria criado se um
  caso de uso real (ex.: administração de papéis customizados) surgir
  — não antes, para evitar abstração prematura ([ADR 002](002-backend-layers.md)).
- Nenhum repository por tabela Prisma, nenhum `BaseRepository`
  genérico, nenhuma interface de repository enquanto existir apenas a
  implementação Prisma — mesmas restrições do ADR 002, agora aplicadas
  aos primeiros agregados reais.
- Controller e Service nunca acessam o Prisma Client diretamente — só
  via Repository, sem exceção.

### Índices e constraints (resumo)

- `users.email` — único.
- `credentials.user_id` — único (1:1).
- `auth_identities` — `@@unique([provider, providerAccountId])`.
- `roles.name` — único.
- `user_roles` — `@@unique([userId, roleId])`.
- `customer_profiles.user_id` / `agent_profiles.user_id` — únicos (1:1).
- `agent_profiles` — `@@unique([licenseState, licenseNumber])`.
- `brokerage_memberships` — `@@unique([userId, brokerageId, role])`.
- `properties.responsible_agent_id` / `properties.brokerage_id` —
  índices simples (consultas por agente/corretora).
- `addresses.property_id` — único (1:1).
- `addresses.location` — índice **GiST**, criado via SQL explícito na
  migration (não expressável diretamente no schema Prisma para um
  campo `Unsupported`).

### Fronteiras de transação

- `UserRepository.createWithCredential(...)` /
  `createWithAuthIdentity(...)`: `User` + (`Credential` ou
  `AuthIdentity`) + `UserRole`(s) iniciais em uma única
  `prisma.$transaction`.
- `BrokerageRepository.createBrokerage(...)`: `Brokerage` +
  `BrokerageMembership` inicial (quando aplicável) em uma transação.
- `PropertyRepository.createProperty(...)`: `Property` (via Client) +
  `Address` (via `INSERT` raw parametrizado, UUID gerado no código) em
  uma única transação.
- Nenhuma transação cruza agregados (ex.: criar `Property` nunca abre a
  mesma transação que altera `User`) — cada agregado gerencia sua
  própria atomicidade internamente.

### Política de `onDelete`

- **`Cascade`**: usado para toda entidade que não faz sentido sem o
  pai e é propriedade exclusiva dele — `Credential`, `AuthIdentity`,
  `UserRole`, `CustomerProfile`, `AgentProfile`, `BrokerageMembership`,
  `Address`.
- **`Restrict`**: usado quando a FK é obrigatória e apagar o pai
  deixaria o filho num estado inválido sem uma decisão explícita de
  reatribuição — `Property.responsibleAgentId → AgentProfile`
  (não se apaga um `AgentProfile` referenciado como responsável por
  imóveis sem reatribuí-los antes; isso também bloqueia, em cascata, a
  exclusão do `User` dono desse `AgentProfile` enquanto o vínculo
  existir) e `UserRole.roleId → Role` (não se apaga um `Role` do
  catálogo enquanto atribuído a algum usuário).
- **`SetNull`**: usado apenas onde a FK já é opcional e a perda do
  vínculo é uma consequência aceitável — `Property.brokerageId`.

### Prisma Client e fronteira com o worker

- O Prisma Client gerado permanece em
  `apps/api/src/generated/prisma-client` **durante as Fases 3 e 4**
  — decisão fechada, não reaberta a cada fase.
- `apps/worker` (Fase 4) **não acessa banco** no fluxo técnico
  `system.ping` (ver seção 11 de TARGET_ARCHITECTURE.md) — o worker
  não precisa, e portanto não recebe, nenhuma dependência de Prisma
  nesta fase nem na próxima.
- O worker **nunca importa arquivos internos de `apps/api`** (nem o
  client gerado, nem repositories) — isso violaria o isolamento de
  processo já estabelecido na seção 2 de TARGET_ARCHITECTURE.md.
- Se, no futuro, o worker precisar de persistência real, a extração de
  um pacote compartilhado (`libs/database` ou equivalente) exigirá uma
  ADR específica própria — não é decidida, nem antecipada, por esta
  ADR (ver "Fora de escopo").

### Arquivos de configuração Prisma: separação schema-only vs. banco real

**O problema que esta seção fecha**: `prisma.config.ts` é um módulo
TypeScript executado inteiro pela CLI antes de qualquer subcomando
rodar. Se esse módulo, ao ser carregado, tentar montar um adapter
(`new PrismaPg({ connectionString: process.env.DATABASE_URL! })`) ou
de qualquer forma exigir `DATABASE_URL` resolvida, **todo** comando
Prisma — inclusive `prisma validate` e `prisma generate`, que não
tocam rede nem precisam de uma URL real — passaria a falhar sem
`DATABASE_URL` definida. Isso quebraria a promessa de `yarn validate`
rodar em clone limpo sem Docker e sem `.env`. Decisão: **três arquivos
de configuração**, cada um com uma única responsabilidade, todos
importando o mesmo caminho de schema de um módulo compartilhado para
nunca divergirem entre si:

- **`apps/api/prisma/prisma-config.shared.ts`** (novo módulo, não um
  arquivo de config em si — nenhuma CLI o chama diretamente): exporta
  as constantes `schema = 'prisma/schema.prisma'`,
  `migrations = 'prisma/migrations'` e `seed = 'prisma/seed.ts'`
  (caminhos únicos, todos relativos a `apps/api` — ver nota de
  resolução abaixo —, usados pelos três arquivos abaixo, eliminando
  qualquer risco de um deles apontar para um schema/diretório de
  migrations/script de seed diferente) e a função
  `requireDatabaseUrl(varName: 'DATABASE_URL' | 'TEST_DATABASE_URL'): string`,
  que lê `process.env[varName]` e **lança um erro explícito e imediato**
  (`Missing required environment variable ${varName}. Refusing to fall back to any default connection string.`)
  se a variável estiver ausente ou vazia — nunca retorna um valor
  default/hard-coded. Esta função é o único lugar do repositório que
  decide "URL de banco ausente é erro fatal, nunca um fallback
  silencioso".
  **Importante sobre resolução de caminho**: o Prisma resolve caminhos
  relativos declarados em um arquivo de configuração **em relação à
  localização do próprio arquivo de configuração**, não em relação ao
  módulo que exportou a constante importada. Como os três arquivos de
  configuração (`prisma.config.ts`, `prisma.migrate.config.ts`,
  `prisma.test.config.ts`) vivem em `apps/api/` — não dentro de
  `apps/api/prisma/`, onde fica o módulo compartilhado — o valor
  correto é `'prisma/schema.prisma'` (relativo a `apps/api/`), nunca
  `'./schema.prisma'` (que resolveria incorretamente para
  `apps/api/schema.prisma`, um caminho que não existe). Ou seja: ao
  carregar qualquer um dos três configs em `apps/api`, o caminho
  `prisma/schema.prisma` resolve corretamente para
  `apps/api/prisma/schema.prisma` — e `prisma/migrations` para
  `apps/api/prisma/migrations`.
- **`apps/api/prisma.config.ts`** (**schema-only, sem env, sem
  adapter**): usado exclusivamente por `db:validate` e `db:generate`.
  Declara apenas `schema` e `migrations` (ambos importados do módulo
  compartilhado) — não importa `requireDatabaseUrl`, não instancia
  `PrismaPg`, não toca `process.env` em nenhum caminho de execução.
  Funciona **identicamente com zero variáveis de ambiente definidas**,
  porque validar sintaxe de schema e gerar o Client são operações que
  não abrem conexão com o banco.
- **`apps/api/prisma.migrate.config.ts`** (**exige `DATABASE_URL`**):
  usado por `db:migrate:dev`, `db:migrate:deploy` e `db:seed` (todos
  contra `mockp`, o banco de desenvolvimento). Importa `schema`,
  `migrations`, `seed` e `requireDatabaseUrl` do módulo compartilhado e
  chama `requireDatabaseUrl('DATABASE_URL')` — se ausente, o comando
  falha imediatamente com a mensagem acima, antes de qualquer
  tentativa de conexão.
- **`apps/api/prisma.test.config.ts`** (**exige `TEST_DATABASE_URL`**):
  usado por `db:migrate:deploy:test` e `db:seed:test` (contra
  `mockp_test`). Mesma estrutura do arquivo acima (`schema`,
  `migrations`, `seed` do módulo compartilhado), trocando apenas o
  nome da variável exigida: `requireDatabaseUrl('TEST_DATABASE_URL')`.

Todo comando Prisma do projeto é sempre invocado com `--config
<arquivo>` explícito (nunca por descoberta automática do nome padrão
`prisma.config.ts`) — elimina ambiguidade sobre qual dos três arquivos
está em uso. Usar uma flag de CLI (`--config`) em vez de substituição
de variável de ambiente inline (`DATABASE_URL=$TEST_DATABASE_URL
<comando>`, sintaxe de shell POSIX que **não funciona no
PowerShell/cmd do Windows** sem wrapper adicional) também é o que torna
os comandos idênticos em Windows, macOS e Linux.

### Pipeline Nx de geração e validação (a criar em 3.2/3.3)

Todos os targets abaixo namespaced sob o projeto `api` (schema vive em
`apps/api/prisma`):

| Target                       | Comando completo                                                        | Config usada                      | Exige URL                                                                                                                    | Cacheável                                                                                               | Uso                                                                                                                                   |
| ---------------------------- | ----------------------------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `api:db:validate`            | `prisma validate --config prisma.config.ts`                             | `prisma.config.ts` (schema-only)  | Nenhuma                                                                                                                      | Sim                                                                                                     | Valida sintaticamente o schema; **entra em `yarn validate` a partir da Tarefa 3.2**, obrigatório, não depende de Docker nem de `.env` |
| `api:db:generate`            | `prisma generate --config prisma.config.ts`                             | `prisma.config.ts` (schema-only)  | Nenhuma                                                                                                                      | Sim — `inputs`: `schema.prisma` + `prisma.config.ts`; `outputs`: `apps/api/src/generated/prisma-client` | Gera o Prisma Client; **entra em `yarn validate`**, não depende de Docker nem de `.env`                                               |
| `api:db:migrate:dev`         | `prisma migrate dev --config prisma.migrate.config.ts`                  | `prisma.migrate.config.ts`        | `DATABASE_URL`                                                                                                               | Não                                                                                                     | Uso local/dev contra `mockp`; cria e aplica migration — nunca roda em CI nem em `yarn validate`/`yarn validate:infra`                 |
| `api:db:migrate:deploy`      | `prisma migrate deploy --config prisma.migrate.config.ts`               | `prisma.migrate.config.ts`        | `DATABASE_URL`                                                                                                               | Não                                                                                                     | Aplica migrations pendentes sem gerar novas; usado em CI/imagem Docker contra `mockp`                                                 |
| `api:db:migrate:deploy:test` | `prisma migrate deploy --config prisma.test.config.ts`                  | `prisma.test.config.ts`           | `TEST_DATABASE_URL`                                                                                                          | Não                                                                                                     | Aplica migrations pendentes em `mockp_test`; parte de `yarn validate:infra`, nunca de `yarn validate`                                 |
| `api:db:seed`                | `prisma db seed --config prisma.migrate.config.ts` (script customizado) | `prisma.migrate.config.ts`        | `DATABASE_URL`                                                                                                               | Não                                                                                                     | Executa o seed determinístico dos 4 papéis contra `mockp`                                                                             |
| `api:db:seed:test`           | `prisma db seed --config prisma.test.config.ts`                         | `prisma.test.config.ts`           | `TEST_DATABASE_URL`                                                                                                          | Não                                                                                                     | Mesmo seed, contra `mockp_test`; parte de `yarn validate:infra`                                                                       |
| `api:db:reset`               | `prisma migrate reset --config prisma.migrate.config.ts`                | `prisma.migrate.config.ts`        | `DATABASE_URL`                                                                                                               | Não                                                                                                     | **Destrutivo** — ver proteção abaixo                                                                                                  |
| `api:test:integration`       | `vitest run --config vitest.integration.config.mts`                     | Sim (já cacheável desde a Fase 2) | Os 34 testes existentes **continuam 100% offline**, com PostgreSQL/PostGIS/Redis mockados — nenhuma mudança de comportamento |
| `api:test:integration:infra` | `vitest run --config vitest.integration.infra.config.mts`               | **Não** (`cache: false`)          | Testes que exercitam repositories/readiness contra PostGIS/Redis reais — depende de estado externo, portanto nunca cacheável |

Dependências obrigatórias entre targets (fecham o "clone limpo"):

- `api:build`, `api:typecheck` e `api:test`/`api:test:integration` (os
  testes offline existentes) declaram `dependsOn: ["db:generate"]` — o
  Client precisa existir antes de typecheck/build/test conseguirem
  resolver o módulo gerado. Nenhum desses depende de Docker.
- `api:serve` já depende de `api:build` (desde a Fase 2) — ao depender
  transitivamente de `db:generate` via `api:build`, `nx serve api`
  chega ao Client gerado sem precisar de um passo manual.
- `yarn install` **não** gera o Prisma Client (nenhum script
  `postinstall`/`prepare` chama `prisma generate`) — gerar o Client é
  responsabilidade exclusiva do target `db:generate`, cacheado pelo Nx.
- Consequência verificável: em um clone limpo do repositório,
  `yarn install --immutable` seguido de `yarn validate` deve passar
  **sem Docker rodando e sem `.env` real** — `yarn validate` aciona
  `validate:nx`, que aciona `api:db:validate`/`api:db:generate`/
  `api:typecheck`/`api:build`/`api:test`, nenhum dos quais toca uma
  conexão de rede com Postgres/Redis.

### `yarn validate` (sem Docker) vs. `yarn validate:infra` (com Docker)

Esta ADR fixa a divisão em dois comandos raiz distintos, resolvendo a
ambiguidade que antes deixava implícito que os testes de integração
existentes passariam a depender de containers reais:

- **`yarn validate`** (já existente desde a Fase 2, sem mudar de nome
  nem de contrato): passa a incluir, além do que já fazia
  (`format:check`, lint do workspace, `validate:nx` com
  `lint`/`typecheck`/`test`/`build` de todos os projetos e
  `api:test:integration`), os novos targets `api:db:validate` e
  `api:db:generate`. **Continua sem exigir Docker nem `.env` real** —
  os 34 testes de integração atuais continuam rodando com
  PostgreSQL/PostGIS/Redis mockados, exatamente como na Fase 2. O hook
  `pre-commit` do Husky continua chamando exatamente `yarn validate`
  (AGENTS.md §7) — ninguém precisa manter o Docker Compose ligado para
  commitar.
- **`yarn validate:infra`** (novo comando raiz, criado na Tarefa 3.4):
  exige o profile padrão do Docker Compose saudável; roda
  `api:db:migrate:deploy:test` (migrations em `mockp_test`),
  `api:db:seed:test` (garante os 4 papéis semeados) e
  `api:test:integration:infra` (repositories e readiness contra
  PostGIS/Redis reais). **Nunca é chamado pelo Husky** nem por
  `yarn validate` — é um comando à parte, para quem está com o Compose
  de pé localmente ou para um futuro job de CI dedicado a infra real.

### Comandos destrutivos e proteção

- `api:db:reset` (`prisma migrate reset`) apaga e recria o banco —
  **nunca** incluído em `yarn validate`, `yarn validate:infra`, no hook
  `pre-commit`, ou em qualquer pipeline de CI.
- Nenhum wrapper do projeto invoca `prisma migrate reset`/`migrate dev`
  com `--force`/`--skip-confirmation` — a confirmação interativa nativa
  do Prisma permanece ativa para uso manual local.
- Documentação (README/AGENTS, a atualizar na implementação) deve
  deixar explícito que `db:reset` só roda contra o banco local do
  profile padrão do Compose, nunca contra qualquer ambiente
  compartilhado.
- CI e imagens Docker usam exclusivamente `migrate deploy` (idempotente
  e não-destrutivo sobre migrations já aplicadas).

### Banco de testes e limpeza segura

- **Banco de desenvolvimento**: `mockp` (`DATABASE_URL`, parte do
  `ServerConfig`). **Banco de testes**: `mockp_test`
  (`TEST_DATABASE_URL`, lida só por testes/scripts — ver "Configuração:
  runtime vs. testes") — URLs distintas, nunca a mesma variável
  reaproveitada com valores diferentes por ambiente.
- Ambos os bancos existem no mesmo container Postgres do profile
  padrão desde o primeiro `docker compose up` (ver script de init em
  "Infraestrutura local" acima) — nenhuma criação manual documentada
  fora do repositório.
- Como parte de `yarn validate:infra`, `api:db:migrate:deploy:test`
  aplica as migrations pendentes em `mockp_test` (via
  `prisma.test.config.ts`, compatível com Windows) e `api:db:seed:test`
  garante os 4 papéis do catálogo — nunca `migrate dev` nem
  `migrate reset`.
- **`roles` nunca é truncada**: é um catálogo semeado (4 papéis fixos),
  não um dado mutável por teste; truncá-la exigiria re-semear a cada
  arquivo sem necessidade. **Limpeza entre arquivos de teste** usa um
  único `TRUNCATE` explícito cobrindo exatamente as **10** tabelas de
  domínio mutáveis (nomes físicos, ver "Convenção de nomes"): `users`,
  `credentials`, `auth_identities`, `user_roles`, `customer_profiles`,
  `agent_profiles`, `brokerages`, `brokerage_memberships`, `properties`,
  `addresses`. **Nunca** `_prisma_migrations` (tabela de controle do
  Prisma) é truncada.
- **Guarda de segurança obrigatória** antes de executar qualquer
  `TRUNCATE`, verificada nesta ordem, abortando **sem executar nenhum
  SQL de truncamento** se qualquer uma falhar:
  1. `process.env.NODE_ENV === 'test'`.
  2. O host de `TEST_DATABASE_URL` está na allowlist de hosts locais
     permitidos (`localhost`, `127.0.0.1`, ou o nome do serviço Compose
     `postgres` quando rodando dentro da rede do Compose) — qualquer
     outro host é rejeitado antes de qualquer tentativa de conexão.
  3. O nome do banco extraído de `TEST_DATABASE_URL` é exatamente
     `mockp_test`.
  4. **Confirmação em runtime contra o próprio banco**:
     `SELECT current_database()` retorna exatamente `mockp_test` — não
     basta a URL _dizer_ `mockp_test`; a rotina confirma contra o banco
     realmente conectado antes de truncar.
     Esta guarda é código de teste (utilitário em `apps/api/test/support`),
     não uma trava do banco em si, e roda antes de qualquer `TRUNCATE`,
     inclusive o primeiro.
- Isso torna estruturalmente impossível a suíte de testes truncar o
  banco de desenvolvimento (`mockp`), um host remoto, ou qualquer banco
  fora do padrão `mockp_test`: qualquer divergência nas quatro checagens
  aborta antes de emitir SQL.

### Dockerfile da API e Prisma

Especificação completa do stage final, para que
`docker run <imagem> yarn workspace api prisma migrate deploy --config prisma.migrate.config.ts`
seja realmente executável sem rede e sem nenhum arquivo do host:

- **Imagem-base, ambos os stages**: `node:24.18.0-bookworm-slim`.
- **Stage `build`**:
  1. `RUN corepack enable && corepack prepare yarn@4.12.0 --activate`
     — resolve e ativa o binário do Yarn `4.12.0` **durante o build**
     (única vez em que há acesso à rede), ficando cacheado na camada
     da imagem; nada disso acontece de novo em runtime.
  2. `WORKDIR /app`. Copia primeiro só os arquivos que definem o grafo
     de workspaces — `package.json` e `yarn.lock` da raiz, `.yarnrc.yml`
     (`nodeLinker: node-modules`, já a convenção do repositório desde a
     Fase 1), e o `package.json` de **cada** workspace
     (`apps/api/package.json`, `libs/config/package.json`) — o Yarn
     Berry precisa de todos os `package.json` do workspace para
     resolver `yarn install --immutable` corretamente, não só do root.
  3. `RUN HUSKY=0 yarn install --immutable` — instala com
     `nodeLinker: node-modules`, produzindo um `node_modules/` real
     (não PnP), incluindo `node_modules/.bin/prisma` a partir da
     dependência `prisma` já declarada no `package.json` da API (ver
     "Impacto de tamanho" abaixo).
  4. Copia o restante do código-fonte (`apps/api/src`,
     `apps/api/prisma/`, `apps/api/prisma*.config.ts`, `libs/config/src`,
     `tsconfig*.json`, `nx.json`).
  5. `RUN yarn nx run api:build` — que, pela cadeia de `dependsOn`
     já fechada nesta ADR, aciona `api:db:generate` (usa
     `prisma.config.ts`, **schema-only, sem `DATABASE_URL`** — funciona
     sem nenhuma variável de ambiente presente no build) antes de
     compilar. O Prisma Client gerado fica em
     `apps/api/src/generated/prisma-client`; o `tsc` compilado fica em
     `dist/apps/api` (destino já fixado em
     `apps/api/tsconfig.build.json` desde a Fase 2).
- **Stage `runtime` (final)**:
  1. Mesma imagem-base; repete
     `RUN corepack enable && corepack prepare yarn@4.12.0 --activate`
     — necessário porque o comando explícito de deploy
     (`yarn workspace api prisma migrate deploy ...`) precisa do
     binário `yarn` disponível **neste** stage também, não só no de
     build; como a versão (`4.12.0`) é a mesma e a resolução acontece
     inteiramente durante o build da imagem, nenhuma rede é acessada
     quando o container roda.
  2. Cria/usa um usuário não-root (reaproveita o usuário `node`,
     uid 1000, já presente na imagem oficial `-slim`, ou cria um
     usuário dedicado equivalente) e roda como esse usuário a partir
     daqui (`USER node`).
  3. `WORKDIR /app`. Copia do stage `build`, e **só** do stage
     `build` (nunca do host): `package.json` e `yarn.lock` da raiz,
     `.yarnrc.yml`, `apps/api/package.json`, `libs/config/package.json`
     (os mesmos metadados de workspace do passo 2 acima — necessários
     para o `yarn workspace api ...` do comando de deploy resolver
     corretamente qual diretório é o workspace `api`), `node_modules/`
     completo (produção, já incluindo `prisma` — ver abaixo),
     `dist/apps/api` (build da API), `apps/api/src/generated/prisma-client`
     (Client já gerado — nunca regerado em runtime), e a lista mínima
     de arquivos Prisma abaixo. **Não** copia `apps/api/prisma.test.config.ts`
     (arquivo de teste, sem uso em produção) nem `apps/api/src`/
     `apps/api/test` (fonte TypeScript não compilado, desnecessário em
     runtime).

     **Lista mínima de arquivos Prisma copiados para o stage final**
     (todos necessários para `yarn workspace api prisma migrate deploy
--config prisma.migrate.config.ts` funcionar dentro da imagem):
     - `apps/api/prisma.migrate.config.ts` — o config efetivamente
       usado pelo comando de deploy.
     - `apps/api/prisma/prisma-config.shared.ts` — **obrigatório**:
       `prisma.migrate.config.ts` importa `schema`, `migrations`,
       `seed` e `requireDatabaseUrl` deste módulo; sem ele copiado, o
       `import` falha e o Prisma CLI não consegue nem carregar o
       config, muito menos rodar o comando.
     - `apps/api/prisma/schema.prisma`.
     - `apps/api/prisma/migrations/` (todas as migrations).
     - `apps/api/prisma.config.ts` **pode** ser incluído também — não é
       necessário para `migrate deploy` (que usa exclusivamente
       `prisma.migrate.config.ts`), mas copiá-lo é inofensivo e mantém
       a imagem coerente com o restante do diretório `apps/api/`
       (mesmo raciocínio de simplicidade que já leva a copiar todo
       `apps/api/prisma/`, não um subconjunto arquivo a arquivo).
       `apps/api/prisma.test.config.ts` continua **fora** da imagem
       final em qualquer cenário — é exclusivo de teste.

  4. **`prisma` é dependência de runtime deliberada, não copiada por
     estratégia separada**: `prisma` (CLI) é declarado como
     `dependency` (não `devDependency`) de `apps/api/package.json`
     exatamente por isso — assim `yarn install --immutable` já o
     resolve para dentro de `node_modules/.bin/prisma` no stage de
     build, e o `COPY --from=build node_modules` do stage final o
     traz automaticamente, sem nenhum passo extra de cópia seletiva
     que pudesse divergir do que o build realmente instalou.
  5. **Impacto de tamanho registrado**: manter `prisma` como
     `dependency` de runtime (em vez de só `@prisma/client`) aumenta o
     tamanho de `node_modules` copiado para a imagem final — aceito
     deliberadamente, porque é exatamente isso que permite rodar
     `migrate deploy` a partir da própria imagem de produção sem uma
     segunda imagem "de ferramentas" e sem acesso à rede em tempo de
     deploy.
- **`CMD` padrão**: `["node", "dist/apps/api/main.js"]` — inicia
  **somente** o processo Node da API. Nenhum `ENTRYPOINT`/script de
  boot roda `migrate deploy` implicitamente antes de subir o servidor;
  isso é verificado pela ausência de qualquer `ENTRYPOINT` que não seja
  o `node` direto, e por não haver `postStart`/hook equivalente.
- **Comando explícito de deploy**, rodado como um passo separado do
  pipeline, nunca automaticamente:
  `docker run <imagem> yarn workspace api prisma migrate deploy --config prisma.migrate.config.ts`.
  `yarn workspace api` resolve o workspace `api` a partir dos
  `package.json`/`yarn.lock`/`.yarnrc.yml` copiados no passo 3 acima
  (sem depender do `WORKDIR` corrente ser exatamente `apps/api`), e
  `prisma.migrate.config.ts` exige `DATABASE_URL` presente no ambiente
  do `docker run` (ver `requireDatabaseUrl`) — sem ela, o comando falha
  explicitamente, nunca tenta um banco padrão.
- **Confirmação de que o comando não baixa nada**: nenhum `yarn
install` roda no stage final nem no `docker run` de deploy — o
  `node_modules` já foi resolvido e copiado do stage `build` (passo 3
  acima), e o binário `yarn` já foi resolvido e ativado via Corepack
  durante o build da imagem (passo 1). `yarn workspace api prisma ...`
  portanto só resolve arquivos já presentes na imagem, sem nenhuma
  chamada de rede — nem para o registro npm, nem para o site do Yarn.
- A imagem permanece **multi-stage**, roda como **usuário não-root**,
  não depende de `node_modules` do host (todo `node_modules` vem do
  próprio stage de build da imagem, nunca de um `COPY` a partir do
  contexto de build local), é **hermética** (nenhum passo de rede fora
  do build) e usa **versões fixas** de Node (`24.18.0-bookworm-slim`) e
  Yarn (`4.12.0`) nos dois stages.

### SQL geoespacial: forma exigida e geração de UUID em inserções raw

`@default(uuid())` só é aplicado pelo Prisma quando a escrita passa
pelo Prisma Client normal. Como a linha de `Address` é inserida via SQL
raw (para poder gravar `location` com `ST_MakePoint`), essa geração
automática **não se aplica** — o Postgres não tem default de UUID
configurado na coluna (nenhuma extensão `pgcrypto`/`uuid-ossp` é
adicionada só para isso).

Decisão: `PropertyRepository` **gera o UUID de `Address` explicitamente
no código** (`randomUUID()` de `node:crypto`, mesmo utilitário nativo
já usado em [request-id.ts](../../apps/api/src/common/request-id.ts))
antes de montar a instrução SQL, e o passa como valor interpolado no
tagged template `Prisma.sql`, dentro da mesma transação (`tx`) que cria
o `Property`:

```ts
await tx.$executeRaw(Prisma.sql`
  INSERT INTO addresses
    (id, property_id, street, city, state, postal_code, country, location, created_at, updated_at)
  VALUES
    (${id}, ${propertyId}, ${street}, ${city}, ${state}, ${postalCode}, ${country},
     ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography, now(), now())
`);
```

- **Obrigatório**: `tx.$executeRaw`/`tx.$queryRaw` usados como **tagged
  template** (ou construídos com `Prisma.sql`/`Prisma.join`) — o Prisma
  parametriza automaticamente cada valor interpolado (`${id}`,
  `${longitude}`, etc.), nunca gerando SQL por concatenação de string.
- **Proibido**: `$executeRawUnsafe` e `$queryRawUnsafe` em qualquer
  ponto do `PropertyRepository` (ou de qualquer outro repository) —
  essas variantes aceitam uma string SQL solta mais um array de
  parâmetros separado, o que reabre a porta para alguém concatenar
  texto na string por engano. Nenhuma delas é usada nesta fase.
- **Proibido**: qualquer interpolação de string (template literal `` ` ``
  puro do JavaScript, concatenação com `+`, etc.) para montar SQL —
  `id`, `propertyId`, os campos de endereço, `longitude` e `latitude`
  são **sempre** valores interpolados de um `Prisma.sql`, nunca texto
  montado manualmente.
- A mesma regra (tagged template `Prisma.sql`, nunca as variantes
  `Unsafe`) vale para qualquer outro acesso a `Address.location` no
  `PropertyRepository`, presente ou futuro.

### Testes com containers reais (`api:test:integration:infra`)

- Os 34 testes de `api:test:integration` (existentes desde a Fase 2)
  **não mudam de natureza** nesta fase — continuam offline, com
  PostgreSQL/PostGIS/Redis mockados, e continuam fazendo parte de
  `yarn validate`.
- Testes que precisam de PostgreSQL/PostGIS/Redis reais vivem em um
  target **novo e separado**, `api:test:integration:infra`
  (`cache: false`), rodando contra o profile padrão do Docker Compose
  já ativo localmente — parte de `yarn validate:infra`, nunca de
  `yarn validate`.
- `mockp_test` é migrado (`api:db:migrate:deploy:test`) e semeado
  (`api:db:seed:test`) antes dessa suíte rodar; a limpeza entre
  arquivos usa o `TRUNCATE` guardado descrito acima (10 tabelas
  mutáveis, `roles` preservada, guarda de 4 checagens).
- Nenhuma biblioteca de containers efêmeros (ex.: Testcontainers) é
  introduzida nesta fase — seria uma dependência nova fora do escopo
  desta ADR.

## Consequências

**Positivas**:

- Todas as decisões estruturais (tipos, cascades, agregados, comandos,
  versões, proteção do banco de testes) ficam fechadas e revisáveis
  antes de qualquer linha de schema ser escrita, sem deixar nada para o
  implementador decidir ad-hoc nas Tarefas 3.1–3.5.
- `Property.responsibleAgentId → AgentProfile.id` move a garantia de
  "responsável possui perfil de agente" para uma restrição de banco
  (FK), em vez de uma validação que precisaria ser reimplementada em
  todo Service que criar/atualizar `Property`.
- Separar `createWithCredential`/`createWithAuthIdentity` evita
  desenhar `User.Credential` como obrigatório, o que quebraria o fluxo
  OAuth documentado no [ADR 004](004-auth-ownership.md) assim que a
  autenticação for implementada — sem fechar a porta a um usuário OAuth
  vincular uma credencial mais tarde.
- Separar `yarn validate` de `yarn validate:infra` mantém o hook
  `pre-commit` e o clone limpo (`yarn install --immutable && yarn
validate`) livres de Docker, enquanto ainda existe um caminho
  formal (`validate:infra`) para validar contra PostGIS/Redis reais.
- Usar `prisma.test.config.ts` + `--config` em vez de substituição de
  variável de ambiente inline resolve a incompatibilidade com
  Windows sem introduzir um script shell adicional.

**Negativas / trade-offs aceitos**:

- `CustomerProfile` nasce como tabela quase vazia (só
  `id`/`userId`/timestamps) — aceito como consequência direta de não
  antecipar campos de jornada futura de `customer`; exigirá uma
  migration adicional quando esses atributos forem aprovados.
- `@@unique([userId, brokerageId, role])` permite cumulatividade de
  papel dentro da corretora, mas exige que o código de aplicação some
  as linhas de `BrokerageMembership` de um usuário para saber todos os
  seus papéis numa corretora, em vez de uma única linha por vínculo.
- Gerar o UUID de `Address` no código (em vez de depender de um default
  de banco) exige disciplina para nunca esquecer de passá-lo ao inserir
  — mitigado por ser a única forma de escrita de `Address` exposta pelo
  `PropertyRepository` (não há um segundo caminho de criação que possa
  esquecer o UUID).
- Incluir o CLI `prisma` na imagem final da API (em vez de só o
  runtime `@prisma/client`) aumenta seu tamanho — aceito para manter a
  imagem hermética e capaz de rodar `migrate deploy` sem depender de
  rede ou de uma segunda imagem no momento do deploy.
- Manter `roles` fora do truncamento entre testes significa que os 4
  papéis precisam ser semeados de forma verdadeiramente idempotente
  (upsert por `name`/id fixo) — se o seed não for idempotente, rodar a
  suíte de infra repetidamente poderia falhar em vez de simplesmente
  confirmar que os papéis já existem.

## Fora de escopo

- Qualquer entidade de negócio fora do núcleo revisado (Inquiry,
  Timeline, Review, Verification, PropertyFeature, Payment,
  RefreshToken).
- Implementação de `docker-compose.yml`, `schema.prisma`,
  `prisma.config.ts`, script de init do Postgres, ou qualquer
  dependência instalada — todos ficam para as Tarefas 3.1 e 3.2.
- Profile `full` do Docker Compose (Fase 9).
- SafeQL ou qualquer outra ferramenta de validação estática de SQL raw.
- Testcontainers ou qualquer outra estratégia de containers efêmeros
  para testes.
- Atributos de perfil/jornada de `CustomerProfile` além do vínculo
  mínimo com `User`.
- Extração de um pacote compartilhado (`libs/database` ou equivalente)
  para o Prisma Client — só se torna relevante **se e quando** o worker
  (Fase 4 ou posterior) precisar de acesso a banco; nesse caso exigirá
  uma ADR própria. Não afeta nenhuma decisão desta fase, já que o
  worker não acessa banco no fluxo `system.ping`.
- Qual papel inicial é atribuído a um novo usuário — regra de negócio
  da futura implementação de autenticação, não da modelagem de dados
  desta fase.
