# Arquitetura alvo

Este documento é a principal fonte de verdade arquitetural do projeto
Mockp. Qualquer alteração aqui descrita deve seguir o processo de ADR
(ver [AGENTS.md](../AGENTS.md)).

## 1. Stack

| Camada                   | Escolha                              |
| ------------------------ | ------------------------------------ |
| Linguagem                | TypeScript strict                    |
| Gerenciador de pacotes   | Yarn 4                               |
| Monorepo                 | Nx                                   |
| Backend framework        | NestJS (adaptador HTTP Express)      |
| Logger da API            | Pino (`nestjs-pino`)                 |
| API                      | REST (sem GraphQL)                   |
| Contrato de API          | OpenAPI/Swagger                      |
| Frontend framework       | Next.js (App Router)                 |
| Estado remoto (frontend) | TanStack Query                       |
| Estilo                   | Tailwind CSS                         |
| Composição visual        | Atomic Design + feature-first        |
| Formulários              | React Hook Form + Zod                |
| Banco de dados           | PostgreSQL                           |
| Extensão geoespacial     | PostGIS                              |
| ORM                      | Prisma                               |
| Cache/broker             | Redis                                |
| Filas                    | BullMQ                               |
| Pagamentos               | Stripe                               |
| Mapas                    | Mapbox                               |
| Infraestrutura local     | Docker e Docker Compose              |
| Topologia de deploy      | Monólito modular com worker separado |

### Explicitamente fora da stack

- GraphQL e Apollo.
- Microservices (nesta etapa do projeto).
- Elasticsearch (no MVP).
- MUI e Emotion.
- Fastify como adaptador HTTP do Nest — o adaptador escolhido é
  Express (ver [ADR 005](adr/005-api-runtime.md)).

Justificativas registradas em [ADR 001](adr/001-rest-openapi.md) e
[ADR 005](adr/005-api-runtime.md).

## 2. Estrutura do monorepo

A estrutura abaixo é conceitual; a estrutura definitiva de arquivos e
configuração do Nx será criada em uma etapa posterior de scaffold.

```
apps/
  api/       # NestJS — API REST
  web/       # Next.js — único app, App Router
  worker/    # Processos BullMQ separados da API

libs/
  api-client/  # Cliente HTTP tipado gerado a partir do OpenAPI
  ui/          # Design system genérico (Atomic Design) e design tokens visuais, sem acesso a domínio (ver seção 5)
  config/      # Configuração de runtime, com entrypoints server-only e client-safe (ver seção 9) — não contém design tokens
  queue/       # Definições de filas/jobs compartilhadas entre api e worker
  testing/     # Utilitários e fixtures de teste compartilhados
```

### Princípio de topologia

- **Monólito modular**: `api` é um único processo NestJS organizado por
  módulos de domínio, não um conjunto de serviços distribuídos.
- **Worker separado**: `worker` é um processo Node independente que
  consome filas BullMQ, permitindo escalar o processamento assíncrono
  sem escalar a API HTTP.
- `api` e `worker` compartilham definições de fila via `libs/queue`, mas
  não compartilham processo nem ciclo de vida.

## 3. Camadas do backend

Fluxo de uma requisição, por domínio:

```
HTTP -> Controller -> Service -> Repository -> Prisma -> PostgreSQL
```

### Responsabilidades

- **Controller**: transporte HTTP, DTOs de entrada/saída, documentação
  Swagger, códigos de status, e delegação ao Service. Não contém regra
  de negócio.
- **Service**: regras de negócio, autorização por recurso (ex.: "este
  `agent` pode editar esta `Property`?"), e orquestração entre
  repositories e adapters.
- **Repository**: acesso ao Prisma, construção de queries, seleção de
  campos (`select`), persistência e transações. Não contém regra de
  negócio.
- **DTOs**: contrato público da API, independente dos modelos gerados
  pelo Prisma. Nunca espelham automaticamente o schema do banco.
- **Module**: composição do domínio (registro de controller, service,
  repository e dependências do NestJS).

### Restrições obrigatórias

- Controller não acessa Repository ou Prisma diretamente.
- Service não acessa Prisma diretamente — apenas via Repository.
- Repository não contém regra de negócio.
- Repository é **orientado a agregado**: existe um repository por
  agregado (uma entidade raiz e suas entidades dependentes diretas),
  nunca um repository por tabela Prisma. Operações atômicas sobre
  tabelas relacionadas de um mesmo agregado (ex.: `Property` e
  `Address`) pertencem ao repository do agregado, não a repositories
  separados coordenados de fora. Ver seção 10 para os agregados do
  núcleo inicial.
- Não criar repository genérico (ex.: `BaseRepository<T>` reutilizável
  entre domínios sem justificativa específica).
- Não criar interfaces de repository enquanto existir apenas uma
  implementação (Prisma). Abstração prematura é evitada.
- Não retornar modelos Prisma diretamente nas respostas da API — sempre
  mapear para DTOs de saída.
- Não expor hashes, tokens ou campos internos em nenhuma resposta.
- Integrações externas (Stripe, Mapbox, Google OAuth, e-mail, etc.)
  ficam isoladas em adapters próprios, nunca chamadas diretamente do
  Service.

Detalhamento e consequências em [ADR 002](adr/002-backend-layers.md).

## 4. Convenções da API

### Endpoints do skeleton

O skeleton inicial expõe exatamente estes endpoints e caminhos de
documentação:

- `GET /api/v1/health/live` — confirma **somente que o processo está
  vivo** (não verifica nenhuma dependência externa).
- `GET /api/v1/health/ready` — confirma que as **dependências
  obrigatórias** da aplicação estão prontas. O que conta como
  "dependência obrigatória" muda ao longo do roadmap: na Fase 2, antes
  de existir qualquer infraestrutura externa, readiness verifica apenas
  a inicialização da própria aplicação; a partir da Fase 3, passa a
  verificar também PostgreSQL/PostGIS e Redis. Falha de qualquer
  dependência retorna `503` com corpo em Problem Details e
  `code: SERVICE_UNAVAILABLE`.
- Swagger UI em `/docs`.
- OpenAPI JSON em `/docs-json`.

Nenhum outro endpoint público é criado no skeleton (ver seção 11 sobre
o job técnico `system.ping`, que não é exposto via HTTP).

### ValidationPipe global

O `ValidationPipe` global é configurado com:

- `transform: true`
- `whitelist: true`
- `forbidNonWhitelisted: true`

### Formato de erro — RFC Problem Details

Toda resposta de erro da API usa o content type
`application/problem+json` e o seguinte formato de corpo:

| Campo       | Obrigatório | Tipo / formato                                                                | Descrição                                                                                                   |
| ----------- | ----------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `type`      | sim         | URI-reference estável, padrão `https://api.mockp.dev/problems/{problem-type}` | Identifica o tipo de erro; `{problem-type}` é o slug em kebab-case do catálogo abaixo.                      |
| `title`     | sim         | string                                                                        | Resumo curto e legível do tipo de erro.                                                                     |
| `status`    | sim         | number                                                                        | Código de status HTTP, repetido no corpo.                                                                   |
| `detail`    | sim         | string                                                                        | Explicação específica desta ocorrência do erro.                                                             |
| `instance`  | sim         | string                                                                        | Path da requisição que originou o erro.                                                                     |
| `code`      | sim         | `SCREAMING_SNAKE_CASE`                                                        | Código de erro estável, em inglês, do catálogo abaixo (ou de um catálogo de domínio futuro).                |
| `requestId` | sim         | string                                                                        | O mesmo correlation ID validado desta requisição (ver subseção Correlation ID).                             |
| `errors`    | não         | `Record<string, string[]>`                                                    | Presente apenas em erros de validação: chave é o nome do campo, valor é a lista de mensagens daquele campo. |

### Catálogo mínimo de erros do skeleton

| `code`                  | `type` (problem type, kebab-case)                      | Status HTTP típico |
| ----------------------- | ------------------------------------------------------ | ------------------ |
| `VALIDATION_ERROR`      | `https://api.mockp.dev/problems/validation-error`      | 400                |
| `NOT_FOUND`             | `https://api.mockp.dev/problems/not-found`             | 404                |
| `RATE_LIMIT_EXCEEDED`   | `https://api.mockp.dev/problems/rate-limit-exceeded`   | 429                |
| `INTERNAL_SERVER_ERROR` | `https://api.mockp.dev/problems/internal-server-error` | 500                |
| `SERVICE_UNAVAILABLE`   | `https://api.mockp.dev/problems/service-unavailable`   | 503                |

Novos códigos específicos de domínio (ex.: `PROPERTY_NOT_FOUND`) serão
adicionados junto com as features que os produzem, cada um com seu
próprio `type` em kebab-case. **Códigos genéricos deste catálogo nunca
são reaproveitados para um significado diferente do original** — uma
nova situação de erro sempre ganha um código novo, ainda que o status
HTTP coincida com um código existente.

**Convenção de idioma**: `type`, `code` e os nomes de campo do contrato
de erro são sempre em inglês, assim como qualquer identificador do
contrato de API. Mensagens (`title`, `detail`) produzidas pelo backend
são destinadas a diagnóstico técnico e logging — **não são usadas
diretamente como texto de interface traduzido**; o frontend mapeia
`code` para mensagens localizadas próprias, não exibe `detail` como
texto de UI por padrão.

### Correlation ID

- Header padrão: `X-Request-Id`.
- Se o cliente enviar um valor válido nesse header, ele é **reutilizado**
  para toda a requisição.
- Valor válido: apenas caracteres alfanuméricos, hífen (`-`) e
  underscore (`_`); tamanho máximo de 128 caracteres.
- Valores ausentes ou que não atendam a esse formato são **substituídos**
  por um UUID gerado pela API.
- A resposta sempre devolve o header `X-Request-Id` com o valor efetivo
  usado.
- O corpo de erro em Problem Details usa esse mesmo valor no campo
  `requestId`.
- O mesmo identificador é propagado para os jobs BullMQ originados a
  partir da requisição (ex.: o payload do job carrega o correlation ID
  da requisição que o enfileirou), permitindo rastrear o fluxo completo
  API → fila → worker.

### Rate limiting

- Rate limiting está habilitado globalmente na API.
- `GET /api/v1/health/live`, `GET /api/v1/health/ready`, o Swagger UI
  (`/docs`) e o OpenAPI JSON (`/docs-json`) são **isentos** de rate
  limiting.
- Todos os demais endpoints seguem a política global de rate limiting.
- Uma requisição bloqueada por rate limiting recebe Problem Details com
  `code: RATE_LIMIT_EXCEEDED` e status `429`.

### Demais convenções

- Prefixo global: `/api`.
- Versionamento: `/v1` (ex.: `/api/v1/properties`).
- Logging estruturado (JSON) em todas as camadas de transporte, via
  Pino (`nestjs-pino`) como logger oficial do Nest e logger HTTP — ver
  [ADR 005](adr/005-api-runtime.md). Campos sensíveis (`authorization`,
  `cookie`, `set-cookie`) são redigidos dos logs.
- Helmet habilitado para cabeçalhos de segurança HTTP.
- CORS restrito por allowlist explícita de origens.
- Graceful shutdown implementado (drenagem de conexões antes de encerrar
  o processo).

## 5. Frontend

### Áreas por persona

Um único app Next.js contém quatro áreas, roteadas por segmento:

- `/customer`
- `/agent`
- `/manager`
- `/admin`

### Combinação Atomic Design + feature-first

- **Feature-first** define **onde** o código de negócio vive: cada
  domínio (ex.: `properties`, `brokerages`) tem sua própria pasta de
  feature, contendo componentes, hooks, query keys e lógica específica
  daquele domínio.
- **Atomic Design** define o **nível de composição visual** dentro do
  design system genérico: `atoms`, `molecules`, `organisms`,
  `templates`.

### Regras obrigatórias

- Componentes visuais genéricos (sem conhecimento de domínio) ficam em
  `libs/ui`.
- Componentes de domínio ficam em `features/<domain>` dentro de `web`.
- Componentes de `libs/ui` não acessam API, Auth.js, TanStack Query ou
  tipos de domínio — são puramente apresentacionais e reutilizáveis.
- `templates` não executam requests nem regras de autorização; apenas
  compõem layout a partir de dados recebidos via props.
- `page.tsx` permanece fino: apenas compõe features e templates,
  delegando lógica para os módulos apropriados.
- Tailwind CSS é a fundação visual. **`libs/ui` é a proprietária dos
  design tokens visuais**: cor, tipografia, espaçamento, radius,
  sombras e breakpoints são todos definidos dentro de `libs/ui`, não em
  `libs/config` (que contém apenas configuração de runtime — ver
  seção 9) nem em `apps/web`. `apps/web` **consome** o CSS/tokens
  exportados por `libs/ui`, nunca os redefine.
- Headless UI pode ser usado para primitives acessíveis (menus, modais,
  dialogs) por trás de composições próprias.
- Tabler Icons é a biblioteca de ícones padrão.
- Storybook documenta o design system (`libs/ui`), garantindo que os
  componentes-base sejam visualizáveis isoladamente.
- TanStack Query controla todo estado remoto (fetch, cache, invalidação)
  no frontend.
- React Hook Form e Zod são usados em todos os formulários, com Zod
  como fonte única de validação client-side.

Detalhamento e consequências em
[ADR 003](adr/003-frontend-organization.md).

## 6. Contrato frontend/backend

- DTOs e controllers do NestJS são a fonte de verdade do contrato de
  API — não existe schema de contrato mantido manualmente em paralelo.
- O `openapi.json` é gerado de forma determinística (mesma entrada
  produz sempre a mesma saída) a partir da introspecção do Nest/Swagger.
- O `openapi.json` gerado é versionado no repositório.
- Tipos TypeScript são gerados a partir do `openapi.json` usando
  `openapi-typescript`.
- `openapi-fetch` é o cliente HTTP base tipado, consumindo os tipos
  gerados.
- Os tipos gerados (`libs/api-client`) são versionados no repositório.
- Hooks do TanStack Query não são gerados automaticamente — cada feature
  escreve seus próprios hooks e query keys sobre o cliente base.
- DTOs não são duplicados manualmente no frontend; qualquer tipo de
  payload vem do cliente gerado.
- O CI deve detectar drift: contrato (`openapi.json`) ou cliente gerado
  desatualizados em relação ao código-fonte da API falham o pipeline
  (targets `contract:generate` e `contract:check`, ver seção 13).

## 7. Autenticação (decisão, não implementação no skeleton)

Resumo da decisão; detalhamento completo em
[ADR 004](adr/004-auth-ownership.md).

- A API é a autoridade final sobre emissão e validação de tokens.
- Access token: JWT de curta duração.
- Refresh token: rotativo, revogável, armazenado em hash (nunca em texto
  plano) no banco.
- Auth.js mantém a sessão no Next.js (frontend).
- Auth.js conduz o fluxo OAuth do Google até obter o ID token do Google.
- A API valida o ID token do Google e emite seus próprios tokens
  (access/refresh) — o Google nunca é a autoridade de sessão da
  aplicação.
- Papéis (`Role`) são cumulativos por usuário.
- Autorização por papel ocorre no guard (nível de rota/endpoint).
- Autorização por recurso (ex.: "este usuário é dono deste imóvel?")
  ocorre no Service.

Nenhum endpoint de autenticação é implementado no skeleton inicial.

## 8. Integrações externas no skeleton: Stripe e Mapbox

Decisão aprovada para o skeleton: Stripe e Mapbox terão **adapters
técnicos funcionais**, validados contra ambientes de teste, sem nenhuma
jornada de negócio construída sobre eles.

### Escopo

- Não há checkout, pagamento, mapa de imóveis ou qualquer jornada
  comercial no skeleton.
- O adapter de Stripe é validado **somente com chave em test mode**.
- O código do adapter de Stripe **rejeita explicitamente** qualquer
  chave em modo live quando executado em ambiente de desenvolvimento ou
  de testes (falha rápida e explícita, não um aviso silencioso).
- O adapter de Mapbox é validado por meio de **uma operação técnica
  controlada** (ex.: geocodificação de um endereço fixo de teste ou
  chamada equivalente de baixo custo), não por uma tela de mapa.

### Estratégia de testes das integrações

- Testes que dependem de rede real contra Stripe/Mapbox são **opt-in**
  e dependem da presença de secrets locais (`.env` não versionado) ou de
  secrets configurados no CI.
- A suíte de testes padrão (a que roda por padrão em desenvolvimento e
  no CI) **usa mocks para Stripe e Mapbox e não depende de rede**.
- Nenhum secret (chave Stripe, token Mapbox) é versionado no
  repositório, em nenhuma branch.

### Exposição de tokens

- O **token público** do Mapbox pode ser exposto ao frontend (é uma
  credencial pública por design do próprio Mapbox).
- **Tokens secretos** de Mapbox (quando existirem) e a **chave secreta
  do Stripe** (`STRIPE_SECRET_KEY`) permanecem exclusivamente
  server-side, nunca chegam ao bundle do frontend. Ver seção 9.

## 9. Configuração e secrets

`libs/config` contém **apenas configuração de runtime**: valores lidos
de variáveis de ambiente, schemas de validação desse ambiente, e
constantes técnicas (ex.: nomes de filas, timeouts). **`libs/config` não
contém design tokens** — cor, tipografia, espaçamento, radius, sombras e
breakpoints são propriedade de `libs/ui` (ver seção 5).

> **Estado de implementação**: `libs/config` foi criada na Fase 2
> contendo somente o entrypoint server-only (`@mockp/config/server`),
> consumido por `apps/api`, com validação de ambiente via Zod (ver
> [ADR 005](adr/005-api-runtime.md)). O entrypoint client-safe é criado
> somente na Fase 7, quando `apps/web` existir.

`libs/config` expõe **entrypoints separados**, para impedir que
configuração sensível seja importada, mesmo por engano, pelo código do
frontend:

- Um entrypoint de **configuração server-only** (ex.:
  `libs/config/server`), consumido apenas por `apps/api` e
  `apps/worker`.
- Um entrypoint de **configuração client-safe** (ex.:
  `libs/config/client`), consumido por `apps/web`.
- **Schemas de ambiente separados por app** (ex.: schema de env de
  `api`, de `worker` e de `web`), cada um validando apenas as variáveis
  que aquele app efetivamente usa.

### Regras obrigatórias

- Código do frontend (`apps/web`) **não pode importar** o entrypoint de
  configuração server-only, em nenhuma circunstância.
- Somente variáveis explicitamente marcadas como públicas (ex.:
  prefixo `NEXT_PUBLIC_` ou lista explícita equivalente) podem chegar ao
  bundle do Next.js.
- Nunca expor ao frontend, direta ou indiretamente: `DATABASE_URL`,
  `REDIS_URL`, segredos de JWT, segredos de refresh token, ou
  `STRIPE_SECRET_KEY`.
- Nenhum secret é versionado no repositório; arquivos de exemplo
  (`.env.example`) contêm apenas nomes de variáveis, nunca valores
  reais.

## 10. Modelo de dados (núcleo multi-tenant)

A modelagem de dados vigente — arquitetura-alvo desta seção — é a
fundação multi-tenant definida pela
[ADR 007](adr/007-multi-tenant-workspace-foundation.md) (`Accepted`),
que supersede exclusivamente a modelagem de dados da ADR 006 (as
decisões de infraestrutura local, Prisma/configuração e pipeline da
ADR 006 continuam válidas e não são afetadas). A ADR 007 é a
**especificação campo a campo** (tipos, defaults, unicidades,
`onDelete`, `CHECK`s, índices) — esta seção resume o modelo, não o
substitui.

> **Estado de implementação**: `apps/api/prisma/schema.prisma`, a
> migration inicial e o seed implementam as 15 entidades multi-tenant
> desta seção (conforme a ADR 007) — Tarefa 3.2 `Completed`, validada
> offline e em banco limpo (ver
> [docs/IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md), Fase 3).

Entidades do núcleo (15):

- `User`
- `Credential`
- `AuthIdentity`
- `Role`
- `UserRole`
- `CustomerProfile`
- `AgentProfile`
- `AgentLicense`
- `Workspace`
- `WorkspaceMembership`
- `WorkspaceMembershipRole`
- `WorkspaceAgent`
- `Brokerage`
- `Property`
- `Address`

Nenhuma entidade fora desta lista faz parte do núcleo aprovado; qualquer
adição exige revisão desta seção (e da ADR 007) antes da implementação.

### Relacionamentos e responsabilidades de cada entidade

- **`User`** é global e **multi-workspace**: contém o e-mail canônico
  (`citext`, normalizado e único) e pode participar de vários
  `Workspace` simultaneamente, cada participação com seu próprio
  `WorkspaceMembership`.
- **`Credential`** referencia `User` em relação um-para-um e contém
  somente `passwordHash` e metadados de credencial (nunca a senha em
  texto plano, nunca exposta em DTOs de saída).
- **`AuthIdentity`** representa provedores externos de identidade (ex.:
  Google) e possui unicidade composta por `provider` +
  `providerAccountId`.
- **`Role`**/**`UserRole`**: catálogo **global**, reduzido a
  `CUSTOMER` e `ADMIN` — `AGENT`/`MANAGER` deixaram de ser papéis
  globais e passaram a ser **contextuais a um workspace**, via
  `WorkspaceMembershipRole`.
- **`CustomerProfile`**/**`AgentProfile`** são perfis globais 1:1 com
  `User` (materializadores do papel, sem atributos de jornada além do
  necessário). `AgentProfile` não guarda mais dados de licença
  diretamente.
- **`AgentLicense`** é 1:N a partir de `AgentProfile` — permite um
  agente ter múltiplas licenças por país/jurisdição.
- **`Workspace`** é a **fronteira de tenant**: `type`
  `INDIVIDUAL` (agente independente, sem `Brokerage`) ou `BROKERAGE`
  (corretora, com `Brokerage` associado). O dono (`ownerUserId`) tem
  requisitos de papel específicos por tipo (ver ADR 007, seção
  "Ownership") — `ownerUserId` concede só permissões de titularidade,
  nunca substitui `WorkspaceMembership`/`WorkspaceMembershipRole`.
- **`WorkspaceMembership`**/**`WorkspaceMembershipRole`** substituem
  `BrokerageMembership` da ADR 006: ligam `User` a um `Workspace`,
  com papéis cumulativos (`MANAGER`+`AGENT` no mesmo membership).
- **`WorkspaceAgent`** representa a elegibilidade operacional de um
  agente **dentro de um workspace específico** — identidade garantida
  por FK composta a `WorkspaceMembership` e FK simples a
  `AgentProfile`.
- **`Brokerage`** é o **perfil exclusivo** do agregado `Workspace`
  quando `type = BROKERAGE` (1:1, `workspaceId` único) — não é um
  agregado próprio.
- **`Property`** exige `workspaceId` e um `responsibleAgentUserId`
  (FK composta para `WorkspaceAgent` do mesmo workspace) — nenhum
  imóvel pode referenciar um agente de outro tenant.
- **`Address`** pertence ao agregado `Property` (1:1, FK composta
  garantindo o mesmo `workspaceId`), com estrutura internacional
  (`addressLine1` obrigatório, `addressLine2`/`district` opcionais,
  além de `countryCode`/`regionCode`/`locality`/`postalCode`) e contém
  a localização geoespacial (PostGIS, SRID 4326).

### Repositories e agregados

- Repositories são **orientados a agregado**, não um repository por
  tabela Prisma (ver também seção 3). Agregados do núcleo:
  `UserRepository` (`User`+`Credential`+`AuthIdentity`+`UserRole`+
  `CustomerProfile`+`AgentProfile`+`AgentLicense`), `WorkspaceRepository`
  (`Workspace`+`WorkspaceMembership`+`WorkspaceMembershipRole`+
  `WorkspaceAgent`+`Brokerage`, já que `Brokerage` é perfil exclusivo
  do agregado `Workspace`) e `PropertyRepository` (`Property`+
  `Address`, já que `Address` pertence ao agregado `Property`).
- Toda operação **tenant-scoped** (que lê/escreve `Property`,
  `Address` ou `WorkspaceAgent`) exige `workspaceId` explícito no
  método do repository — nenhum método os lê/escreve sem esse
  contexto.
- Operações atômicas sobre tabelas relacionadas de um mesmo agregado
  pertencem ao repository desse agregado, garantidas dentro da mesma
  transação Prisma.

> **Estado de implementação**: `PrismaModule`/`PrismaService`, o módulo
> de Redis e os três repositories acima ainda não existem no código —
> a Tarefa 3.3 (Fase 3, ver
> [docs/IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md)) está
> autorizada, mas continua sem nenhuma implementação. O planejamento
> arquitetural está concluído e aprovado —
> [ADR 008](adr/008-runtime-persistence-and-repositories.md) está
> `Accepted`. A Tarefa 3.3 é executada subtarefa por subtarefa (oito no
> total, ver ADR 008 §8); somente a subtarefa 3.3.1
> (`RuntimeConfigModule` e `RedisModule`/`RedisService` com testes
> offline) está autorizada a começar — as subtarefas 3.3.2 a 3.3.8
> ainda não estão autorizadas.

### Decisões de modelagem

- Identificadores primários: UUIDv7 (`dbgenerated("uuidv7()")`, nativo
  do PostgreSQL 18) em toda entidade com ID não determinístico — exceto
  `Role.id`, catálogo versionado e determinístico, sem default, sempre
  explícito (ver seed).
- `citext` (extensão PostgreSQL) para `email`, `slug`, `licenseNumber`
  e `jurisdictionCode` — comparação case-insensitive no banco.
- Valores monetários: `Decimal` (nunca `float`/`double`).
- Timestamps consistentes (`createdAt`/`updatedAt`) em todas as
  entidades, mais lifecycle explícito (`status` + timestamp de
  transição + `version` para concorrência otimista) em `User`,
  `Workspace`, `WorkspaceMembership`, `WorkspaceAgent` e `Property`.
- Localização geográfica via PostGIS, SRID 4326, com índice GiST.
- Seed mínimo e determinístico, reduzido ao catálogo `Role`
  (`CUSTOMER`/`ADMIN`).

### Explicitamente fora do modelo inicial

- Inquiries (manifestações de interesse).
- Timelines de acompanhamento comercial.
- Reviews.
- Verificações de corretor/corretora.
- Pagamentos de negócio (o modelo de dados de cobrança não faz parte do
  núcleo inicial; Stripe entra apenas como adapter técnico, ver
  seção 8).

## 11. Fluxos técnicos do skeleton

- **API ↔ Web**: Web consome a API via `libs/api-client` (tipos gerados
  - `openapi-fetch`), orquestrado por TanStack Query.
- **API ↔ Worker (`system.ping`)**: não existe endpoint HTTP público
  para disparar este job. Um comando/smoke target interno da API
  inicializa o contexto Nest (`NestFactory.createApplicationContext`),
  resolve o producer da fila e publica o job `system.ping` diretamente
  via BullMQ. O worker consome o job normalmente. Este fluxo **não entra
  no OpenAPI** — não é parte do contrato público da API. O smoke test
  correspondente verifica: payload do job, processamento pelo worker,
  comportamento de retry, propagação de correlation ID, e graceful
  shutdown do worker durante/após o processamento.
- **API ↔ PostgreSQL**: via Prisma, através da camada Repository.
- **Infraestrutura local**: PostgreSQL (com PostGIS) e Redis sobem via
  Docker Compose (ver seção 12).

## 12. Infraestrutura local e Docker Compose

### Profiles

- **Profile padrão**: sobe apenas PostGIS (PostgreSQL com extensão
  PostGIS) e Redis — o suficiente para rodar `api` e `worker`
  localmente fora de container durante o desenvolvimento.
- **Profile `full`**: sobe adicionalmente `api`, `worker` e `web` como
  containers, além de PostGIS e Redis — usado para validar o sistema de
  ponta a ponta em containers.

### Dockerfiles

- Existe um Dockerfile **separado por aplicação**: `apps/api`,
  `apps/worker` e `apps/web` — sem Dockerfile único compartilhado entre
  eles.
- As imagens-base usadas nesses Dockerfiles têm **versões fixadas**
  (tag explícita, nunca `latest`).
- Os containers de `api`, `worker`, `web`, PostGIS e Redis possuem
  **health checks** configurados no Docker Compose.
- Volumes de dados (PostgreSQL, Redis) usam **volumes nomeados**, nunca
  bind mounts implícitos ou volumes anônimos.
- Os containers das aplicações (`api`, `worker`, `web`) executam como
  **usuário não-root** quando a imagem-base suportar essa configuração.
- A imagem de cada aplicação **não pode depender de arquivos não
  copiados para dentro dela, nem de `node_modules` do host** — tudo o
  que a aplicação precisa em runtime deve estar copiado/instalado
  dentro da própria imagem.

### Quando cada Dockerfile é criado e validado

- O Dockerfile de cada aplicação é criado na fase em que essa aplicação
  é construída (API na Fase 3, worker na Fase 4, web na Fase 7 — ver
  [docs/IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md)), **não**
  todos de uma vez na Fase 9.
- Cada Dockerfile deve **buildar com sucesso** e a aplicação
  correspondente deve **iniciar a partir da imagem gerada** já na fase
  em que ele é criado — essa é a primeira validação do Dockerfile, não
  a Fase 9.
- A Fase 9 **não é a primeira validação** dos Dockerfiles individuais:
  ela valida apenas a **execução conjunta** de API, worker e web como
  containers no profile `full` do Docker Compose, reunindo Dockerfiles
  já validados isoladamente nas fases anteriores.

> Nesta etapa apenas a decisão é documentada — nenhum Dockerfile ou
> `docker-compose.yml` é criado ainda (ver
> [docs/IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md)).

## 13. Estratégia de testes

### Stack de testes

- **Vitest** — testes unitários e de integração em TypeScript (API,
  worker, libs).
- **Testing Library** — testes de componentes React.
- **Supertest** — testes de API REST (contra a aplicação Nest em
  memória ou em processo local).
- **Playwright** — testes de smoke/e2e do frontend.
- **Storybook** — documentação e verificação visual dos componentes de
  `libs/ui`.
- **Containers reais** (via Docker Compose, profile padrão) para testes
  de integração que dependem de PostGIS e Redis.
- **Mocks** para Stripe e Mapbox na suíte padrão (ver seção 8).
- **Testes sandbox externos** (rede real contra Stripe/Mapbox) somente
  opt-in, dependentes de secrets locais ou de CI (ver seção 8).

### Validações Nx obrigatórias

O pipeline de validação do monorepo inclui, no mínimo, os seguintes
targets Nx:

- `format:check`
- `lint`
- `typecheck`
- `test`
- `test:integration`
- `contract:generate`
- `contract:check`
- `build`

### Comando `yarn validate` e proteção local via Husky

`yarn validate` é o comando raiz que agrega essas validações: roda
`format:check`, o lint do workspace (incluindo arquivos de configuração
na raiz, que não pertencem a nenhum projeto Nx) e, via `validate:nx`,
os targets cacheáveis do Nx (`lint`, `typecheck`, `test` e `build` de
todos os projetos, mais `api:test:integration`) — ver
`package.json` para os scripts exatos.

Um hook `pre-commit` do Husky executa `yarn validate` automaticamente
antes de cada commit local. Isso é uma **proteção de desenvolvimento
local**, não um substituto de CI: qualquer pipeline de CI configurado
no futuro deve rodar `yarn validate` (ou os mesmos targets) de forma
independente do hook. Em ambientes sem Git (ex.: imagens Docker, alguns
runners de CI com checkout raso), a instalação/execução dos hooks pode
ser desabilitada definindo a variável de ambiente `HUSKY=0` antes de
`yarn install` (ex.: `HUSKY=0 yarn install`).

## 14. Observabilidade e operação

- Logging estruturado em API e Worker.
- Correlation ID propagado entre requisição HTTP e jobs de fila
  originados por ela, quando aplicável.
- Endpoints de liveness e readiness na API, usados pela orquestração de
  containers.
- Graceful shutdown em API e Worker.
