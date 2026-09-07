# ADR 007 — Fundação multi-tenant: `Workspace` como fronteira de isolamento

## Status

Accepted

## Contexto

O modelo de dados fechado pela [ADR 006](006-persistence-and-local-infrastructure.md)
(`Accepted`, implementado na Tarefa 3.2) trata `Brokerage` como a única
unidade de agrupamento comercial e não oferece uma fronteira de isolamento
única para um agente independente, uma corretora, ou (no futuro) qualquer
plano/cobrança por tenant. Antes de a Tarefa 3.2 ser dada como concluída,
o responsável pelo projeto pediu a introdução de `Workspace` como unidade
de isolamento e futura cobrança, com `User` permanecendo global e podendo
participar de vários workspaces.

Esta ADR **supersede as seções de modelagem de dados da ADR 006** (seção
"Entidades permitidas" em diante) — as decisões de infraestrutura local
(Docker Compose, Redis, separação de configs Prisma, pipeline
`yarn validate`) da ADR 006 **permanecem em vigor** e não são alteradas
aqui.

Esta ADR **não implementa nada**: nenhum `schema.prisma`, migration, seed
ou teste é alterado. Ela fecha o desenho para revisão do responsável pelo
projeto antes de qualquer mudança de código — consistente com AGENTS.md
§2 ("mudança arquitetural... o agente deve parar e propor uma ADR para
aprovação antes de implementar qualquer código"). A Tarefa 3.2 permanece
`In Progress` durante esta revisão; a Tarefa 3.3 continua bloqueada.

**Nota de revisão (microcorreção pós-primeira reimplementação)**: após a
primeira reimplementação de `schema.prisma`/migration/seed conforme esta
ADR (validada offline, ainda não aplicada a um banco limpo), o
responsável pelo projeto aprovou explicitamente cinco ajustes pontuais,
incorporados diretamente nas seções abaixo (sem alterar o `Status`
`Accepted` nem reabrir nenhuma das quatro questões já fechadas em
"Questões em aberto para aprovação"): `Role.id` sem geração automática
(ver "Papéis globais reduzidos"), três índices auxiliares de FK (ver
"Índices mínimos"), estrutura internacional completa de `Address` com
`addressLine1`/`addressLine2`/`district` (ver "`Property` e `Address`
escopados por `workspaceId`") e `AgentLicense.jurisdictionCode` como
`citext` (ver "`AgentProfile` e `AgentLicense`"). Estes ajustes foram
aprovados **antes** da validação em banco limpo (Etapa B da
reimplementação) — a migration inicial ainda não foi aplicada a
`mockp`/`mockp_test`.

## Decisão

### Visão geral do modelo (15 entidades)

Substitui as 11 entidades da ADR 006 por 15:

- Globais (inalteradas na forma, `Role` com catálogo reduzido):
  `User`, `Credential`, `AuthIdentity`, `Role`, `UserRole`,
  `CustomerProfile`, `AgentProfile`.
- Licenciamento profissional: `AgentLicense` (nova, substitui os campos
  `licenseNumber`/`licenseState` que estavam em `AgentProfile`).
- Fundação de workspace (novas): `Workspace`, `WorkspaceMembership`,
  `WorkspaceMembershipRole`, `WorkspaceAgent`.
- Continuam existindo, agora escopadas a um workspace: `Brokerage`,
  `Property`, `Address`.

`BrokerageMembership` e o enum `BrokerageMemberRole` da ADR 006 são
**removidos**, substituídos por `WorkspaceMembership`/
`WorkspaceMembershipRole`.

### `Workspace`

| Campo                   | Tipo                                                  | Obrigatório | Default                   | Único        | Justificativa                                                                                     |
| ----------------------- | ----------------------------------------------------- | ----------- | ------------------------- | ------------ | ------------------------------------------------------------------------------------------------- |
| `id`                    | `String @db.Uuid`                                     | Sim         | `dbgenerated("uuidv7()")` | PK           | UUIDv7 — ver "UUIDv7 e `citext`: decisões confirmadas" abaixo                                     |
| `type`                  | `WorkspaceType` (enum `INDIVIDUAL \| BROKERAGE`)      | Sim         | —                         | Não          | Discrimina se o workspace é de um agente independente ou de uma corretora                         |
| `name`                  | `String @db.Text`                                     | Sim         | —                         | Não          | Nome de exibição/comercial do workspace — ver "Nomes: `Workspace.name` vs. `Brokerage.legalName`" |
| `slug`                  | `String @db.Citext`                                   | Sim         | —                         | Sim, global  | Identidade de URL/roteamento, case-insensitive                                                    |
| `ownerUserId`           | `String @db.Uuid`                                     | Sim         | —                         | Não (índice) | Dono do workspace — ver "Ownership" abaixo                                                        |
| `status`                | `WorkspaceStatus` (`ACTIVE \| SUSPENDED \| ARCHIVED`) | Sim         | `ACTIVE`                  | Não          | Lifecycle do tenant — ver "Coerência entre status e timestamps"                                   |
| `archivedAt`            | `DateTime? @db.Timestamptz(3)`                        | Não         | `null`                    | Não          | Coerente com `status = ARCHIVED` — ver "Coerência entre status e timestamps"                      |
| `version`               | `Int`                                                 | Sim         | `1`                       | Não          | Concorrência otimista — ver "Coerência entre status e timestamps"                                 |
| `createdAt`/`updatedAt` | `DateTime @db.Timestamptz(3)`                         | Sim         | —                         | —            | Padrão                                                                                            |

- `ownerUserId` referencia `User.id`, `onDelete: Restrict` — não se apaga
  um `User` que é dono de um workspace sem transferir a titularidade
  antes (mesma disciplina de proteção já usada em `Property.responsibleAgentId → AgentProfile`
  na ADR 006).
- `type` é **imutável após a criação**: não existe caso de uso para
  migrar um workspace de `INDIVIDUAL` para `BROKERAGE` ou vice-versa: um
  agente independente que quer virar corretora cria um novo `Workspace`.
  A aplicação nunca expõe um caminho de atualização desse campo — não é
  reforçado por `CHECK`/trigger no banco (ver "Criação de `Workspace`/
  `Brokerage`: o que o banco garante e o que não garante" abaixo).
- Um `Workspace.INDIVIDUAL` é criado ao concluir o onboarding de um
  agente. Um `Workspace.BROKERAGE` é criado no onboarding de uma
  corretora e tem **exatamente um** `Brokerage` associado (ver
  `Brokerage` abaixo) — nenhum desses fluxos de onboarding é
  implementado nesta ADR nem na Tarefa 3.2; apenas o modelo de dados que
  os suportará.
- **Workspace `INDIVIDUAL`: agente operacional inicial e obrigatório**
  — o dono de um `Workspace.INDIVIDUAL` sempre tem, no mesmo
  membership ativo, **`MANAGER` e `AGENT`** (via `WorkspaceMembershipRole`),
  um `AgentProfile` e um `WorkspaceAgent` `ACTIVE` desde a criação (ver
  "Ownership" abaixo) — `MANAGER` permite administrar o próprio
  workspace, `AGENT` + `WorkspaceAgent.ACTIVE` permitem atuar e receber
  imóveis. Isso o torna o **agente operacional inicial e obrigatório**
  do workspace, não o **único** — o schema não contém nenhuma restrição
  que impeça outros usuários de ganharem papel `AGENT`/`WorkspaceAgent`
  no mesmo `Workspace.INDIVIDUAL` depois (ex.: um agente independente
  que passa a ter um assistente também autorizado a atuar).

#### Semântica de `Workspace.type`

- `WorkspaceType` representa a **natureza jurídica/operacional** do
  tenant — não a quantidade de membros. Um `INDIVIDUAL` com vários
  membros/agentes continua sendo `INDIVIDUAL`; um `BROKERAGE` com um
  único membro (o dono) continua sendo `BROKERAGE`.
- **`INDIVIDUAL`** é uma operação vinculada diretamente ao corretor
  responsável (o dono) e **não possui** `Brokerage`.
- **`BROKERAGE`** representa uma corretora e **deve possuir**
  `Brokerage` (ver "Criação de `Workspace`/`Brokerage`" abaixo para o
  que garante isso).
- Um `Workspace.INDIVIDUAL` pode receber outros membros ou agentes
  (ver bullet anterior) **sem mudar automaticamente de tipo** — ganhar
  membros não transforma um `INDIVIDUAL` em `BROKERAGE`.
- `type` **continua imutável** após a criação (ver bullet acima).
- Uma eventual **transformação jurídica** (ex.: um agente independente
  que decide formalizar uma corretora) será tratada futuramente por
  uma **operação explícita de criação/migração de workspace** (criar
  um novo `Workspace.BROKERAGE` e migrar o que for aplicável) — **fora
  do escopo** desta ADR; não existe, e não é proposto aqui, um caminho
  de "converter" um `Workspace` existente de um `type` para outro.

### Papéis globais reduzidos

`RoleName` passa a ter **somente** `CUSTOMER` e `ADMIN`. `AGENT` deixa de
ser um papel global — a existência de um `AgentProfile` já denota que o
usuário é um agente. `MANAGER` deixa de ser global — é sempre contextual
a um workspace, via `WorkspaceMembershipRole`. `UserRole` continua
existindo sem mudança estrutural, apenas com um catálogo `Role` menor.

**`Role.id` é a única exceção ao default UUIDv7 desta ADR** (ver "UUIDv7
e `citext`: decisões confirmadas" abaixo): `Role` é um **catálogo
versionado e determinístico**, não uma entidade transacional — seus dois
únicos IDs (`CUSTOMER`/`ADMIN`) são valores fixos, explícitos, definidos
pelo seed (ver "Seed" abaixo), nunca gerados pelo banco. `Role.id` tem
`@id @db.Uuid`, **sem** `@default(dbgenerated("uuidv7()"))` — nenhuma
role pode depender de um ID gerado automaticamente, e os IDs `...002`
(`AGENT`)/`...003` (`MANAGER`) removidos do catálogo nunca são
reaproveitados para outro significado.

### `WorkspaceMembership` e `WorkspaceMembershipRole`

| Campo (`WorkspaceMembership`) | Tipo                                                        | Obrigatório | Default                   | Único     | Justificativa                                                            |
| ----------------------------- | ----------------------------------------------------------- | ----------- | ------------------------- | --------- | ------------------------------------------------------------------------ |
| `id`                          | `String @db.Uuid`                                           | Sim         | `dbgenerated("uuidv7()")` | PK        | —                                                                        |
| `workspaceId`                 | `String @db.Uuid`                                           | Sim         | —                         | Composto* | `Workspace`, `Cascade`                                                   |
| `userId`                      | `String @db.Uuid`                                           | Sim         | —                         | Composto* | `User`, `Cascade`                                                        |
| `status`                      | `WorkspaceMembershipStatus` (`ACTIVE \| SUSPENDED \| LEFT`) | Sim         | `ACTIVE`                  | Não       | Controla o **acesso geral** do usuário ao tenant — ver "Autorização"     |
| `joinedAt`                    | `DateTime @db.Timestamptz(3)`                               | Sim         | `now()`                   | Não       | —                                                                        |
| `endedAt`                     | `DateTime? @db.Timestamptz(3)`                              | Não         | `null`                    | Não       | Coerente com `status = LEFT` — ver "Coerência entre status e timestamps" |
| `version`                     | `Int`                                                       | Sim         | `1`                       | Não       | Concorrência otimista                                                    |
| `createdAt`/`updatedAt`       | `DateTime @db.Timestamptz(3)`                               | Sim         | —                         | —         | Padrão                                                                   |

\* `@@unique([workspaceId, userId])` — um usuário tem **no máximo um**
membership por workspace (papéis cumulativos vivem em
`WorkspaceMembershipRole`, não em múltiplos memberships).

`WorkspaceMembershipRole`: `id`, `membershipId` (FK `WorkspaceMembership`,
`Cascade`), `role` (`WorkspaceMemberRole`: `MANAGER \| AGENT`),
`createdAt`/`updatedAt`; `@@unique([membershipId, role])` — permite um
mesmo membership acumular `MANAGER` **e** `AGENT` (duas linhas), mesma
lógica já usada para `BrokerageMembership` na ADR 006. O papel `AGENT`
**concede a permissão** de atuar como agente; a **elegibilidade
operacional** de fato (poder ser atribuído a novos imóveis agora) é
controlada separadamente por `WorkspaceAgent.status` — ver "Autorização"
abaixo.

O proprietário do workspace é representado **apenas** por
`Workspace.ownerUserId` — não existe um papel `OWNER` duplicado em
`WorkspaceMembershipRole`. Ver "Ownership" abaixo para as invariantes
que ligam `ownerUserId` a um membership real.

#### Máquina de estados de `WorkspaceMembership.status`

Transições permitidas:

- `ACTIVE → SUSPENDED`
- `SUSPENDED → ACTIVE`
- `ACTIVE/SUSPENDED → LEFT`
- `LEFT → ACTIVE` é permitido como **reentrada** — reutiliza a mesma
  linha (não cria um novo `WorkspaceMembership`), porque
  `@@unique([workspaceId, userId])` já impede uma segunda linha para o
  mesmo par workspace/usuário.

Semântica dos campos de tempo através dessas transições:

- `createdAt` representa a **primeira criação** do vínculo — nunca é
  alterado por nenhuma transição, inclusive reentradas.
- `joinedAt` representa o **início do período ativo mais recente** —
  atualizado para `now()` toda vez que o `status` entra em `ACTIVE`,
  inclusive na reentrada a partir de `LEFT` (não só na criação).
- `endedAt` é preenchido com `now()` ao entrar em `LEFT`, e **limpo**
  (`null`) na reentrada para `ACTIVE`.
- Toda transição é aplicada pelo `Repository` via compare-and-swap em
  `version` (`UPDATE ... WHERE id = $1 AND version = $2`), nunca uma
  escrita incondicional.

O **histórico completo** de entradas e saídas de um workspace (quando
cada `SUSPENDED`/`LEFT`/reentrada aconteceu, não só o estado atual)
depende de uma futura trilha de auditoria — **fora do escopo desta
ADR**; `WorkspaceMembership` guarda apenas o estado corrente mais o
timestamp do período ativo em curso.

### `AgentProfile` e `AgentLicense`

`AgentProfile` (global, 1:1 `User`) perde `licenseNumber`/`licenseState`
— fica reduzido a `id`, `userId` (único), `createdAt`, `updatedAt` (mesmo
formato "materializador" já usado para `CustomerProfile` na ADR 006).

`AgentLicense` (nova, 1:N a partir de `AgentProfile`):

| Campo                   | Tipo                          | Obrigatório | Único     | Justificativa                                                                                        |
| ----------------------- | ----------------------------- | ----------- | --------- | ---------------------------------------------------------------------------------------------------- |
| `id`                    | `String @db.Uuid`             | Sim         | PK        | `dbgenerated("uuidv7()")`                                                                            |
| `agentProfileId`        | `String @db.Uuid`             | Sim         | Composto* | `AgentProfile`, `Cascade`                                                                            |
| `countryCode`           | `String @db.Char(2)`          | Sim         | Composto* | ISO 3166-1 alpha-2 — ver "Normalização e validação de formato"                                       |
| `jurisdictionCode`      | `String @db.Citext`           | Sim         | Composto* | Estado/província/região dentro do país, case-insensitive — ver "Normalização e validação de formato" |
| `licenseNumber`         | `String @db.Citext`           | Sim         | Composto* | Case-insensitive — ver "Normalização e validação de formato"                                         |
| `createdAt`/`updatedAt` | `DateTime @db.Timestamptz(3)` | Sim         | —         | Padrão                                                                                               |

\* `@@unique([countryCode, jurisdictionCode, licenseNumber])`. Permite um
agente ter múltiplas licenças (múltiplos países/jurisdições).
`licenseNumber` normalizado (trim; maiúsculas onde a jurisdição usar
formato alfanumérico) na camada de aplicação **além** do `citext`, que já
resolve a comparação case-insensitive no banco — a normalização de
aplicação continua existindo para exibição consistente, não para a
unicidade em si.

**`jurisdictionCode` é `citext`** (ajuste aprovado após a primeira
reimplementação da Tarefa 3.2, antes da validação em banco limpo), pela
mesma razão de `licenseNumber`: evita duplicidades como `SP`/`sp`/`Sp`
sendo tratadas como jurisdições diferentes. Com `jurisdictionCode` e
`licenseNumber` ambos `citext`, a unicidade composta
`(countryCode, jurisdictionCode, licenseNumber)` trata `BR`/`SP`/`ABC123`
e `BR`/`sp`/`abc123` como a **mesma** combinação — o banco rejeita a
segunda inserção como duplicata.

### `WorkspaceAgent` — identidade via FK composta e lifecycle próprio

Representa "este `User` (via seu `AgentProfile`) está autorizado a atuar
como agente neste `Workspace`", com um lifecycle **independente** do
`WorkspaceMembership` (ver "Autorização" abaixo para a distinção entre os
três controles de acesso).

| Campo                   | Tipo                                                      | Obrigatório | Default                   | Único     | Relacionamento/onDelete                                                     |
| ----------------------- | --------------------------------------------------------- | ----------- | ------------------------- | --------- | --------------------------------------------------------------------------- |
| `id`                    | `String @db.Uuid`                                         | Sim         | `dbgenerated("uuidv7()")` | PK        | —                                                                           |
| `workspaceId`           | `String @db.Uuid`                                         | Sim         | —                         | Composto* | ver abaixo                                                                  |
| `userId`                | `String @db.Uuid`                                         | Sim         | —                         | Composto* | ver abaixo                                                                  |
| `status`                | `WorkspaceAgentStatus` (`ACTIVE \| SUSPENDED \| REVOKED`) | Sim         | `ACTIVE`                  | Não       | Elegibilidade operacional — ver "Autorização"                               |
| `revokedAt`             | `DateTime? @db.Timestamptz(3)`                            | Não         | `null`                    | Não       | Coerente com `status = REVOKED` — ver "Coerência entre status e timestamps" |
| `version`               | `Int`                                                     | Sim         | `1`                       | Não       | Concorrência otimista                                                       |
| `createdAt`/`updatedAt` | `DateTime @db.Timestamptz(3)`                             | Sim         | —                         | —         | Padrão                                                                      |

\* `@@unique([workspaceId, userId])` — um `WorkspaceAgent` por par
workspace/usuário.

Identidade garantida **pelo banco**, não por validação de aplicação, por
duas foreign keys de naturezas diferentes — nunca as trate como "duas FKs
compostas": apenas a primeira é composta, a segunda é simples:

1. **FK composta** `(workspaceId, userId) → WorkspaceMembership(workspaceId, userId)`
   — exige `@@unique([workspaceId, userId])` em `WorkspaceMembership`
   (já definido acima) como alvo. Garante que só existe `WorkspaceAgent`
   para quem já é membro **daquele** workspace especificamente.
   `onDelete: Cascade` (perder o membership invalida a autorização de
   agente automaticamente).
2. **FK simples** `userId → AgentProfile.userId` — garante que o
   usuário efetivamente possui um `AgentProfile`. `onDelete: Restrict`
   (não se apaga um `AgentProfile` referenciado por um `WorkspaceAgent`
   sem desautorizar o agente antes — mesma disciplina de proteção já
   usada pela ADR 006 para `Property.responsibleAgentId`).

Essas duas FKs, juntas, eliminam a necessidade de uma validação de
aplicação "membership.userId === agentProfile.userId === user.id": a
própria inserção no banco falha se as identidades não coincidirem.

Índices: `(workspaceId, status)` e `(userId, status)` — suportam consultas
de "quem está elegível a atuar neste workspace agora" e "em quais
workspaces este usuário está elegível a atuar agora", respectivamente.

#### Máquina de estados de `WorkspaceAgent.status`

Transições permitidas:

- `ACTIVE → SUSPENDED`
- `SUSPENDED → ACTIVE`
- `ACTIVE/SUSPENDED → REVOKED`
- `REVOKED → ACTIVE` é permitido como **nova autorização** — reutiliza
  a mesma linha (não cria um novo `WorkspaceAgent`), porque
  `@@unique([workspaceId, userId])` já impede uma segunda linha para o
  mesmo par workspace/usuário.

Semântica dos campos de tempo:

- `createdAt` representa a **primeira autorização** — nunca é alterado
  por nenhuma transição.
- `revokedAt` é preenchido com `now()` ao entrar em `REVOKED`, e
  **limpo** (`null`) na reativação para `ACTIVE`.
- **Reativação** (`SUSPENDED/REVOKED → ACTIVE`) exige, no momento da
  transição, as mesmas três condições da criação: `WorkspaceMembership.status = ACTIVE`,
  papel `AGENT` presente, e `AgentProfile` existente para o usuário —
  ver "Autorização" abaixo.
- Toda transição é aplicada pelo `Repository` via compare-and-swap em
  `version`, nunca uma escrita incondicional.

O **histórico completo** de autorizações (quando cada
`SUSPENDED`/`REVOKED`/reativação aconteceu) fica para uma futura
trilha de auditoria — fora do escopo desta ADR.

### Autorização: membership, papel e elegibilidade operacional

Três controles distintos, cada um com sua própria fonte de verdade —
nenhum deles substitui os outros:

- **`WorkspaceMembership.status`** controla o **acesso geral** do
  usuário ao tenant (consegue entrar no workspace, ver o que seu papel
  permite). `SUSPENDED`/`LEFT` revogam esse acesso geral,
  independentemente de papéis.
- **`WorkspaceMembershipRole.AGENT`** concede a **permissão** de atuar
  como agente naquele workspace — é um papel, não um estado
  operacional. Ter o papel não implica estar operacionalmente elegível
  agora.
- **`WorkspaceAgent.status`** controla a **elegibilidade operacional**
  e a possibilidade de **novas atribuições**: só um `WorkspaceAgent`
  `ACTIVE` pode ser atribuído a um `Property` novo ou reatribuído a um
  existente.

Regras derivadas, a serem aplicadas pelo `Repository` (nunca por
Controller/Service direto, ver ADR 002) quando os fluxos forem
implementados na Tarefa 3.3 em diante:

- **Criar ou reativar** um `WorkspaceAgent` exige, simultaneamente:
  `WorkspaceMembership.status = ACTIVE`, papel `AGENT` presente em
  `WorkspaceMembershipRole`, e um `AgentProfile` existente para o
  usuário.
- Um `Property` **existente** pode continuar referenciando um
  `WorkspaceAgent` `SUSPENDED` ou `REVOKED` — isso preserva o histórico
  do imóvel (quem foi o responsável) sem exigir reatribuição imediata.
  A FK composta de `Property` (ver "`Property` e `Address` escopados
  por `workspaceId`" abaixo) não depende do `status` do
  `WorkspaceAgent`, só da sua existência dentro do mesmo workspace —
  então esse histórico nunca é invalidado pela mudança de `status`.
- **Novas atribuições e reatribuições** (definir o responsável de um
  `Property` novo, ou trocar o responsável de um existente) exigem que
  o `WorkspaceAgent` alvo esteja `ACTIVE` no momento da operação.

### Ownership

Ownership é uma camada de **titularidade**, separada das três camadas
operacionais descritas em "Autorização":

- **`WorkspaceMembership.status = ACTIVE` é pré-condição para qualquer
  acesso ao tenant** — inclusive para o dono. Não existe dono sem
  membership ativo.
- **`WorkspaceMembershipRole`** controla as **permissões operacionais
  normais** (`MANAGER`/`AGENT`) — o dono as possui do mesmo jeito que
  qualquer outro membro, via papel(is) atribuído(s) em seu membership.
  `MANAGER` e `AGENT` são **cumulativos**: nada impede (e o requisito
  de `INDIVIDUAL` abaixo exige) que o mesmo membership acumule os dois
  papéis simultaneamente.
- **`WorkspaceAgent`** controla a **elegibilidade operacional do
  agente**, também igual para o dono e para qualquer outro membro com
  papel `AGENT`.
- **`ownerUserId` concede somente as permissões exclusivas de
  titularidade** — hoje, transferir a titularidade do workspace; no
  futuro, administração de billing. `ownerUserId` **não substitui
  membership** e **não concede automaticamente** permissões
  operacionais de `MANAGER` ou `AGENT` — essas continuam vindo
  exclusivamente de `WorkspaceMembershipRole`/`WorkspaceAgent`, mesmo
  para quem é dono.

**Requisito por tipo de workspace** (aplicado atomicamente na criação
pelo `Repository`, ver abaixo):

- **`Workspace.INDIVIDUAL`**: o dono deve possuir, no mesmo membership
  ativo, **`WorkspaceMembershipRole.MANAGER` e `WorkspaceMembershipRole.AGENT`**,
  um `AgentProfile` e um `WorkspaceAgent` `ACTIVE`. `MANAGER` permite
  administrar o próprio workspace; `AGENT` + `WorkspaceAgent.ACTIVE`
  permitem atuar e receber imóveis — ver "Workspace `INDIVIDUAL`:
  agente operacional inicial e obrigatório" em "`Workspace`" acima.
- **`Workspace.BROKERAGE`**: o dono deve possuir
  `WorkspaceMembership.status = ACTIVE` e
  `WorkspaceMembershipRole.MANAGER`. Se o dono **também** atuar como
  corretor, ele acumula adicionalmente `WorkspaceMembershipRole.AGENT`,
  um `AgentProfile` e um `WorkspaceAgent` `ACTIVE` — mas nenhum desses
  três é exigido só por ser dono de uma `BROKERAGE`; `MANAGER` sozinho
  já satisfaz o requisito mínimo de ownership desse tipo.

Demais invariantes:

- **O membership do dono não pode ser movido para `SUSPENDED` ou
  `LEFT` enquanto ele continuar sendo o dono.** Para suspender ou
  encerrar o membership de quem é dono, é necessário primeiro
  **transferir a titularidade** (mudar `Workspace.ownerUserId` para
  outro usuário) na mesma transação, antes de aplicar a mudança de
  `status` do membership antigo.
- **A transferência de titularidade** deve garantir atomicamente, na
  mesma transação do `Repository`, que o **novo** dono já satisfaz o
  requisito do tipo do workspace **antes** de `ownerUserId` ser
  atualizado — nunca existe uma janela em que `ownerUserId` aponte
  para alguém sem esses pré-requisitos:
  - **`INDIVIDUAL`**: `WorkspaceMembership.status = ACTIVE` +
    `WorkspaceMembershipRole.MANAGER` + `WorkspaceMembershipRole.AGENT`
    - `AgentProfile` + `WorkspaceAgent.ACTIVE`.
  - **`BROKERAGE`**: `WorkspaceMembership.status = ACTIVE` +
    `WorkspaceMembershipRole.MANAGER`. `AGENT`/`AgentProfile`/
    `WorkspaceAgent` só são exigidos do novo dono se ele também atuar
    como corretor — mesma regra opcional descrita acima para a
    criação.
- Essas invariantes (dono com membership ativo + papéis/perfis
  exigidos pelo tipo de workspace + transferência atômica) **serão
  aplicadas pelo `Repository`** quando os fluxos de onboarding/
  transferência forem implementados — não são expressáveis como
  constraint declarativa do Prisma sobre um discriminador de `type`
  (ver "Criação de `Workspace`/`Brokerage`" abaixo para os limites
  reais dessa garantia).

### Criação de `Workspace`/`Brokerage`: o que o banco garante e o que não garante

Um `CHECK` constraint do PostgreSQL é avaliado por linha, dentro da
própria tabela, e **nunca pode consultar outra tabela** — não há como
um `CHECK` em `Workspace` "ver" se existe uma linha correspondente em
`Brokerage`. A ADR anterior sugeria isso como opção viável; está
corrigido aqui.

O que o banco **de fato** garante, sozinho, com uma constraint real:

- **`Brokerage.workspaceId` é `@unique`** — isso garante, no banco,
  **somente** "no máximo um `Brokerage` por workspace". Não garante
  "exatamente um `Brokerage` para todo `Workspace.BROKERAGE`" (um
  `BROKERAGE` sem nenhum `Brokerage` ainda não viola essa constraint),
  nem impede um `Brokerage` associado a um `Workspace.INDIVIDUAL`.

O que **não** é garantido pelo banco, e fica como invariante de
**aplicação**, aplicada transacionalmente pelo `Repository`:

- A **compatibilidade entre `Workspace.type` e a existência de
  `Brokerage`** (`BROKERAGE` ⇒ tem `Brokerage`; `INDIVIDUAL` ⇒ não tem)
  e a **existência de exatamente um `Brokerage` para todo
  `Workspace.BROKERAGE`** são invariantes de aplicação: o `Repository`
  responsável por criar um `Workspace.BROKERAGE` cria, na mesma
  transação Prisma, o `Workspace` e o `Brokerage` associado. Nenhum
  `Controller`/`Service` cria essas linhas diretamente (ADR 002).

**Sem um `CHECK`/trigger entre tabelas, o banco por si só não impede**
uma violação dessas invariantes feita por SQL manual, por um script
administrativo, ou por qualquer código futuro que acesse o banco
contornando o `Repository`. Isso é um **trade-off deliberadamente
aceito** nesta fase (ver "Consequências" abaixo) — não uma garantia
absoluta. Não se afirma que a invariante "nunca pode ser violada"; ela
é protegida pelo caminho normal de escrita (`Repository`), não pelo
schema. Nenhum `CHECK`/trigger entre tabelas é adicionado nesta fase.

### Nomes: `Workspace.name` vs. `Brokerage.legalName`

Para eliminar a duplicidade de "nome" entre as duas entidades:

- **`Workspace.name`** é o nome de **exibição/comercial** — o que
  aparece na interface, pode ser ajustado livremente pelo dono.
- **`Brokerage.legalName`** (renomeado de `Brokerage.name` na ADR 006)
  é a **razão social** da corretora — dado de registro, tipicamente
  mais formal e menos frequentemente alterado que o nome de exibição do
  workspace.

Dados de registro, verificação e documentos da corretora (CNPJ/licença
de corretora, comprovantes, etc.) continuam **fora do escopo** desta
ADR — `legalName` é o único campo de identificação formal adicionado
agora.

### `Brokerage`

`id`, `legalName` (`String @db.Text`, razão social — ver "Nomes"
acima), `createdAt`/`updatedAt`, mais `workspaceId` (`String @db.Uuid`,
**único**, FK `Workspace`, `onDelete: Cascade` — o `Brokerage` é
propriedade exclusiva do seu `Workspace.BROKERAGE`, não existe fora
dele).

### `Property` e `Address` escopados por `workspaceId`

`Property` ganha `workspaceId` (obrigatório, FK `Workspace`,
`onDelete: Restrict` — ver "Hard delete" abaixo) e substitui
`responsibleAgentId → AgentProfile.id` (ADR 006) por
`responsibleAgentUserId`, com **FK composta**
`(workspaceId, responsibleAgentUserId) → WorkspaceAgent(workspaceId, userId)`,
`onDelete: Restrict`. Isso é o que torna estruturalmente impossível um
`Property` apontar para um agente de outro workspace — a FK composta
falha na inserção, não é uma checagem de aplicação (a FK não exige
`status = ACTIVE`, então um `Property` existente continua válido mesmo
que o `WorkspaceAgent` referenciado seja depois suspenso/revogado — ver
"Autorização" acima). `brokerageId` é **removido**: o tipo/perfil do
`Workspace` já determina se o anúncio pertence a uma corretora.

Campos adicionais em `Property`: `status` (`PropertyStatus`:
`DRAFT \| PUBLISHED \| ARCHIVED`), `currency` (`Char(3)`, ISO 4217,
obrigatório, **sem default** — nunca assume uma moeda, ver
"Normalização e validação de formato"), `publishedAt`, `archivedAt`,
`version`.

`Address` ganha `workspaceId` (obrigatório) com **FK composta**
`(workspaceId, propertyId) → Property(workspaceId, id)` — exige
`@@unique([workspaceId, id])` em `Property` como alvo (adicional ao PK
simples). Isso torna estruturalmente impossível um `Address` apontar
para um `Property` de outro workspace. `onDelete: Cascade` (filho
exclusivo de `Property`, mesma regra da ADR 006).

**Estrutura internacional completa** (ajuste aprovado após a primeira
reimplementação da Tarefa 3.2, antes da validação em banco limpo):
`Address` guarda `addressLine1` (`String @db.Text`, obrigatório),
`addressLine2` (`String? @db.Text`, opcional), `district` (`String?
@db.Text`, opcional), além de `countryCode`, `regionCode`, `locality`,
`postalCode` (nunca nomes livres de país/estado como identidade
territorial — ver "Normalização e validação de formato" para
`countryCode`) e `location`:

- `addressLine1` guarda a linha principal do endereço — tipicamente
  logradouro e número.
- `addressLine2` guarda complemento, unidade, apartamento ou ponto de
  referência.
- `district` guarda bairro/distrito quando aplicável ao país/região.
- A estrutura é deliberadamente **internacional**: não introduz campos
  brasileiros obrigatórios como `streetNumber` ou `neighborhood` — a
  granularidade brasileira (bairro, número) é coberta pelos campos
  opcionais/genéricos acima, não por campos dedicados a um único país.
- Persistir o endereço completo não implica expô-lo integralmente — a
  API poderá controlar futuramente quais detalhes de `Address` são
  públicos; essa política de exposição é responsabilidade de camadas
  futuras (fora do escopo desta ADR), não do modelo de dados.

### UUIDv7 e `citext`: decisões confirmadas

Ambas abaixo são **decisões técnicas fechadas** desta ADR, não questões
em aberto — cada uma carrega um critério de validação obrigatório a
cumprir durante a implementação, não uma escolha ainda pendente do
responsável:

- **UUIDv7**: todas as entidades com ID não determinístico usam
  `@default(dbgenerated("uuidv7()"))` — a função nativa do PostgreSQL 18
  (monotônica, amigável a índices B-tree por ser ordenável no tempo, ao
  contrário de UUIDv4). PostgreSQL 18 oferece `uuidv7()` nativamente.
  **Critério de validação obrigatório antes de escrever a migration**:
  confirmar empiricamente, contra a imagem `postgis/postgis:18-3.6` já
  fixada pela ADR 006, que `SELECT uuidv7();` funciona — se não
  funcionar, a implementação para e reporta, não substitui
  silenciosamente por outro mecanismo de geração. **`Role` é a única
  exceção** a este default: os dois UUIDs fixos do catálogo `Role`
  (`CUSTOMER`/`ADMIN`, ver "Papéis globais reduzidos" acima e "Seed"
  abaixo) continuam explícitos, nunca gerados pelo banco — `Role.id` não
  tem `@default`.
- **`citext`**: o Prisma suporta `String @db.Citext` quando a extensão
  `citext` está habilitada no banco. Extensão habilitada via SQL
  explícito na migration (mesmo padrão já usado para `postgis` na ADR
  006 — `CREATE EXTENSION IF NOT EXISTS citext;`, sem usar o bloco
  `extensions` do datasource do Prisma, para não introduzir a
  dependência de uma preview feature adicional). Usada via `@db.Citext`
  em `User.email`, `Workspace.slug`, `AgentLicense.licenseNumber` e
  `AgentLicense.jurisdictionCode`.
  **Critério de validação obrigatório antes de aplicar a migration**:
  `prisma validate`/`prisma generate` (schema-only, sem banco) e depois
  a aplicação real da migration continuam sendo os critérios de aceite
  — se `@db.Citext` não for aceito pelo Prisma 7.10.0 como esperado, a
  implementação para e reporta.

### Normalização e validação de formato

`CHECK` constraints SQL explícitos, adicionados na migration (o Prisma
não os gera declarativamente neste fluxo, mesmo padrão do índice GiST
customizado da ADR 006):

| Campo                                              | Regra                                                                  |
| -------------------------------------------------- | ---------------------------------------------------------------------- |
| `AgentLicense.countryCode` / `Address.countryCode` | Exatamente duas letras maiúsculas: `~ '^[A-Z]{2}$'`                    |
| `Property.currency`                                | Exatamente três letras maiúsculas: `~ '^[A-Z]{3}$'`                    |
| `User.email`                                       | Sem espaço externo: `= btrim(email)`                                   |
| `Workspace.slug`                                   | Sem espaço externo: `= btrim(slug)`                                    |
| `AgentLicense.licenseNumber`                       | Sem espaço externo: `= btrim(license_number)`                          |
| `AgentLicense.jurisdictionCode`                    | Sem espaço externo e não vazio: `= btrim(jurisdiction_code)` + `<> ''` |
| `Address.addressLine1`                             | Sem espaço externo e não vazio: `= btrim(address_line_1)` + `<> ''`    |
| `Address.addressLine2` (quando não nulo)           | Sem espaço externo e não vazio: `= btrim(address_line_2)` + `<> ''`    |
| `Address.district` (quando não nulo)               | Sem espaço externo e não vazio: `= btrim(district)` + `<> ''`          |
| `Address.regionCode`                               | Sem espaço externo e não vazio: `= btrim(region_code)` + `<> ''`       |
| `Address.locality`                                 | Sem espaço externo e não vazio: `= btrim(locality)` + `<> ''`          |
| `Address.postalCode`                               | Sem espaço externo e não vazio: `= btrim(postal_code)` + `<> ''`       |

Esses `CHECK`s validam **apenas formato** (comprimento, caixa, ausência
de espaço nas bordas, não-vazio) — **nunca** a existência real de um
código ISO 3166-1/4217 contra uma tabela de referência. Validar que
`"ZZ"` ou `"XXX"` são códigos reais (e não apenas duas/três letras
maiúsculas) é responsabilidade de uma tabela de referência ou de
validação de aplicação futura, fora do escopo desta ADR. O `CHECK` de
`countryCode` (duas letras maiúsculas) é preservado sem alteração.

### `User` — lifecycle

Ganha `status` (`UserStatus`: `ACTIVE \| SUSPENDED \| DEACTIVATED`),
`deactivatedAt` (`DateTime?`) e `version` (`Int`), mesma disciplina de
lifecycle explícito aplicada a `Workspace`/`WorkspaceMembership`/
`WorkspaceAgent`/`Property`.

### Coerência entre status e timestamps

Regras de coerência `status ⇔ timestamp`, cada uma reforçada por um
`CHECK` SQL explícito na migration (linha única, sem consultar outra
tabela — compatível com a limitação de `CHECK` descrita acima):

| Entidade              | Regra                                                                                                                                                                                                                               | `CHECK` (esboço)                                          |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `User`                | `status = DEACTIVATED` **se e somente se** `deactivatedAt` não nulo                                                                                                                                                                 | `(status = 'DEACTIVATED') = (deactivated_at IS NOT NULL)` |
| `Workspace`           | `status = ARCHIVED` se e somente se `archivedAt` não nulo                                                                                                                                                                           | `(status = 'ARCHIVED') = (archived_at IS NOT NULL)`       |
| `WorkspaceMembership` | `status = LEFT` se e somente se `endedAt` não nulo                                                                                                                                                                                  | `(status = 'LEFT') = (ended_at IS NOT NULL)`              |
| `WorkspaceAgent`      | `status = REVOKED` se e somente se `revokedAt` não nulo                                                                                                                                                                             | `(status = 'REVOKED') = (revoked_at IS NOT NULL)`         |
| `Property`            | `DRAFT`: `publishedAt` e `archivedAt` nulos. `PUBLISHED`: `publishedAt` não nulo e `archivedAt` nulo. `ARCHIVED`: `archivedAt` não nulo; `publishedAt` pode continuar preenchido (o imóvel já foi publicado antes de ser arquivado) | três ramos combinados num único `CHECK` por `status`      |

`version` (presente em `User`, `Workspace`, `WorkspaceMembership`,
`WorkspaceAgent`, `Property`) tem `CHECK (version >= 1)` e é
**incrementada pelo `Repository`** a cada update, como controle de
concorrência otimista (compare-and-swap na cláusula `WHERE version =
$esperado`) — nunca incrementada pelo banco automaticamente, para que o
`Repository` possa detectar e rejeitar uma escrita concorrente
desatualizada.

### Hard delete e cascade

- **Cascade** continua restrito a filhos exclusivos que não fazem
  sentido sem o pai: `Credential`, `AuthIdentity`, `UserRole`,
  `CustomerProfile`, `AgentProfile` → `User`; `AgentLicense` →
  `AgentProfile`; `WorkspaceMembershipRole` → `WorkspaceMembership`;
  `WorkspaceAgent` → `WorkspaceMembership` (via a FK composta);
  `Brokerage` → `Workspace`; `Address` → `Property` (via a FK
  composta).
- **Restrict** protege qualquer exclusão que deixaria uma raiz de tenant
  ou um histórico de negócio órfão: `Workspace.ownerUserId → User`;
  `Property.workspaceId → Workspace`; `Property.responsibleAgentUserId`
  (composto) `→ WorkspaceAgent`; `WorkspaceAgent.userId → AgentProfile`;
  `UserRole.roleId → Role` (herdado da ADR 006).
- Apagar um `Workspace` (hard delete) portanto exige primeiro apagar/
  mover todos os `Property` daquele workspace — nunca é uma cascata
  silenciosa que arrasta dados de negócio junto.

### Isolamento sem RLS (por enquanto)

RLS **não** entra nesta ADR. O isolamento nesta fase é garantido por
`workspaceId` presente em toda entidade de negócio + as FKs compostas
descritas acima + repositories que exigem contexto de workspace
explícito em toda operação (nenhum método de repository lê/escreve
`Property`/`Address`/`WorkspaceAgent` sem um `workspaceId` no argumento
— decisão de implementação, aplicada quando os repositories forem
criados na Tarefa 3.3, fora do escopo desta ADR). RLS exigirá uma ADR
própria depois de existir autenticação real e uma forma segura de
propagar o contexto de workspace para as sessões do Prisma.

### Índices mínimos

- `WorkspaceMembership`: `(userId, status)`, `(workspaceId, status)`
  (além do único `(workspaceId, userId)`).
- `WorkspaceAgent`: `(workspaceId, status)` e `(userId, status)` (além
  do único `(workspaceId, userId)`) — cobrem tanto "quem está elegível
  neste workspace" quanto "onde este usuário está elegível", já com o
  `status` próprio descrito em "`WorkspaceAgent`" acima.
- `Property`: `(workspaceId, status, createdAt)`,
  `(workspaceId, responsibleAgentUserId, status)`,
  `(status, publishedAt)` (listagem pública).
- `Address.location`: GiST (herdado da ADR 006).
- Índices auxiliares em toda coluna de FK que não já tenha um índice
  único cobrindo-a — explicitamente: `AuthIdentity.userId`,
  `UserRole.roleId` e `AgentLicense.agentProfileId` (ajuste registrado
  após a primeira reimplementação da Tarefa 3.2, antes da validação em
  banco limpo; as demais colunas de FK já tinham cobertura por um
  índice único ou pelos índices compostos listados acima).

### Seed

O catálogo global passa a conter **somente**:

```
CUSTOMER = 00000000-0000-4000-8000-000000000001
ADMIN    = 00000000-0000-4000-8000-000000000004
```

Os IDs `...002` (`AGENT`) e `...003` (`MANAGER`) da ADR 006 são
removidos do catálogo `Role` (não reaproveitados para outro
significado — mesma disciplina já usada para os `code` de Problem
Details). Nenhum `Workspace`, `User`, `Brokerage` ou `Property` de
exemplo é semeado.

## Consequências

**Positivas**:

- A garantia "um imóvel nunca aponta para agente/endereço de outro
  tenant" passa a ser uma restrição de banco (FK composta), não uma
  validação que precisaria ser reimplementada e testada em todo
  Service/Repository.
- Separar `AgentLicense` de `AgentProfile` permite múltiplas licenças
  por país/jurisdição sem redesenhar o schema quando o segundo país for
  suportado.
- Reduzir o catálogo `Role` a `CUSTOMER`/`ADMIN` remove a ambiguidade
  entre "papel global" e "papel de workspace" que existia com `AGENT`/
  `MANAGER` na ADR 006.
- Separar `WorkspaceMembership.status` (acesso geral),
  `WorkspaceMembershipRole.AGENT` (permissão) e `WorkspaceAgent.status`
  (elegibilidade operacional) evita sobrecarregar um único campo de
  status com significados diferentes, e permite suspender a
  elegibilidade de um agente sem encerrar seu vínculo com o workspace.

**Negativas / trade-offs aceitos**:

- 15 entidades (contra 11), três lifecycles de status distintos
  (membership/role/agent) e três FKs compostas/únicas adicionam
  complexidade de schema e de migration em relação à ADR 006 — aceito
  como o custo de mover a garantia de isolamento e de coerência de
  estado para o banco em vez de deixá-las como responsabilidade só de
  aplicação.
- A migration inicial da Tarefa 3.2 será **reescrita do zero** (não
  incrementada) — como nenhuma migration foi publicada/commitada, isso
  é aceitável agora e seria inaceitável depois que a migration
  existisse em qualquer ambiente compartilhado.
- **Várias invariantes de negócio permanecem sob responsabilidade
  transacional do `Repository`, não integralmente protegidas pelo
  banco**: a compatibilidade `Workspace.type` ⇔ existência de
  `Brokerage` (só "no máximo um" é garantido pela unicidade de
  `Brokerage.workspaceId`; "exatamente um para todo `BROKERAGE`" é
  disciplina de criação transacional — ver "Criação de `Workspace`/
  `Brokerage`"); e as invariantes de ownership — dono com membership
  ativo, papel correto para o tipo de workspace, e transferência
  atômica antes de suspender/encerrar o membership do dono (ver
  "Ownership"). Nenhuma delas tem `CHECK`/trigger entre tabelas — um
  `CHECK` entre tabelas não é possível no PostgreSQL, e um trigger
  equivalente adicionaria complexidade operacional (a manter, testar e
  depurar) para reforçar o que a disciplina de `Repository` já cobre
  no caminho normal de escrita. **Isso é aceito como trade-off
  deliberado**: SQL manual, scripts administrativos, ou código futuro
  que acesse o banco contornando o `Repository` podem violar essas
  invariantes sem que o banco, sozinho, os impeça.

## Questões em aberto para aprovação

Nenhuma questão arquitetural permanece em aberto nesta revisão — as
quatro questões da versão anterior desta ADR foram todas resolvidas
acima: lifecycle próprio de `WorkspaceAgent` (seção "`WorkspaceAgent`"),
reforço de `Workspace.type`/`Brokerage` por criação transacional em vez
de `CHECK`/trigger (seção "Criação de `Workspace`/`Brokerage`"), e
UUIDv7/`citext` (seção "UUIDv7 e `citext`: decisões confirmadas",
tratadas como decisões técnicas fechadas com critério de validação
obrigatório, não mais como escolhas pendentes).

## Fora de escopo

- Endpoints, Controllers, Services, `PrismaModule`, `RedisModule` ou
  qualquer repository — tudo isso é Tarefa 3.3 em diante, não
  autorizada por esta ADR.
- Auditoria completa, outbox, convites de workspace, billing/Stripe,
  limites de plano, verificações profissionais e políticas RLS —
  mencionados como direção futura, não implementados aqui; qualquer
  entidade futura deverá carregar `workspaceId`.
- Dados de registro, verificação e documentos da corretora (além de
  `Brokerage.legalName`) — ver "Nomes: `Workspace.name` vs.
  `Brokerage.legalName`".
- Trigger de banco para reforçar `Workspace.type` imutável — a
  imutabilidade é garantida por nenhum caminho de código expor um
  update desse campo (ver "`Workspace`"); um trigger defensivo
  adicional pode ser revisitado no futuro se necessário, não é
  adicionado agora.
- Validação de existência real de códigos ISO 3166-1/4217 (só formato é
  validado, ver "Normalização e validação de formato").
- Migração de dados existentes — não há dados em nenhum ambiente
  compartilhado ainda (nenhuma migration da ADR 006 foi publicada).
- Testes de integração contra infraestrutura real além do que já está
  previsto no target reservado para isso (Tarefa 3.4).
