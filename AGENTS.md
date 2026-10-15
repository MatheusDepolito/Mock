# AGENTS.md — Regras obrigatórias para agentes

Este documento é vinculante para qualquer agente (humano ou IA) que
trabalhe neste repositório. Em caso de conflito entre uma instrução
pontual e este documento, este documento prevalece, salvo autorização
explícita e específica do responsável pelo projeto para o contrário.

## 1. Ordem de leitura obrigatória antes de qualquer alteração

Antes de propor ou executar qualquer alteração, leia, nesta ordem:

1. [AGENTS.md](AGENTS.md) (este documento).
2. [docs/PRODUCT_CONTEXT.md](docs/PRODUCT_CONTEXT.md).
3. [docs/TARGET_ARCHITECTURE.md](docs/TARGET_ARCHITECTURE.md).
4. [docs/REFERENCE_REPOSITORY.md](docs/REFERENCE_REPOSITORY.md).
5. [docs/IMPLEMENTATION_ROADMAP.md](docs/IMPLEMENTATION_ROADMAP.md).
6. Todos os arquivos em [docs/adr/](docs/adr/) relevantes para a área
   tocada.

Não é permitido pular esta leitura alegando familiaridade prévia com o
projeto. O estado da documentação é a referência corrente, não a memória
do agente.

## 2. Proibição de mudanças arquiteturais não autorizadas

- É proibido alterar decisões registradas em `docs/TARGET_ARCHITECTURE.md`
  ou em qualquer ADR de `docs/adr/` sem autorização explícita do
  responsável pelo projeto.
- Alterações arquiteturais incluem, sem se limitar a: trocar camadas do
  backend, introduzir GraphQL, mudar o gerenciador de pacotes, mudar o
  ORM, alterar a estrutura de `apps/` e `libs/`, mudar a estratégia de
  autenticação, ou introduzir novo serviço externo.
- Se uma tarefa parecer exigir uma mudança arquitetural, o agente deve
  parar e propor uma ADR para aprovação antes de implementar qualquer
  código.
- Divergências entre o código existente e a documentação devem ser
  reportadas, não resolvidas silenciosamente a favor do código.

## 3. Investigação obrigatória antes de implementação

Antes de escrever código, o agente deve:

- Verificar, em [docs/IMPLEMENTATION_ROADMAP.md](docs/IMPLEMENTATION_ROADMAP.md),
  qual fase está `In Progress` (ou qual foi a última `Completed`, se
  nenhuma estiver `In Progress`), e confirmar que a tarefa pedida
  pertence a essa fase. Uma tarefa que pertence a uma fase `Pending`
  posterior não deve ser iniciada sem autorização explícita.
- Ler os arquivos e módulos relacionados ao domínio da tarefa.
- Verificar se já existe uma solução, utilitário ou padrão equivalente no
  repositório antes de criar um novo.
- Confirmar que a tarefa está alinhada com a fase corrente do
  [docs/IMPLEMENTATION_ROADMAP.md](docs/IMPLEMENTATION_ROADMAP.md); não
  antecipar entregáveis de fases futuras.
- Identificar explicitamente premissas e, quando houver ambiguidade
  relevante, perguntar antes de decidir por conta própria.

## 4. Validações obrigatórias antes de concluir uma tarefa

Uma tarefa não está concluída até que o agente:

- Rode `yarn validate` — o comando oficial que agrega
  `format:check`, lint do workspace e, via `validate:nx`, os targets
  cacheáveis do Nx (`lint`, `typecheck`, `test`, `build` de todos os
  projetos e `api:test:integration`). É o mesmo comando que o hook
  `pre-commit` do Husky executa localmente (ver seção 7) — nunca deve
  ser pulado antes de considerar uma tarefa concluída.
- Rode as verificações de tipo, lint e testes aplicáveis ao escopo
  alterado.
- Verifique que nenhuma regra de camada do backend foi violada (ver ADR
  [002](docs/adr/002-backend-layers.md)).
- Verifique que nenhum contrato público (DTOs, OpenAPI) foi quebrado sem
  atualização correspondente do cliente gerado.
- Confirme que nenhuma credencial, segredo ou dado sensível foi
  adicionado ao código ou à documentação.
- Se a tarefa concluiu uma fase do
  [docs/IMPLEMENTATION_ROADMAP.md](docs/IMPLEMENTATION_ROADMAP.md),
  atualize o status dessa fase para `Completed` e o README.md com a
  nova fase corrente **na mesma alteração**; nunca deixe o roadmap e o
  README divergentes sobre qual é a fase corrente.
- Confirme que, ao final da tarefa, no máximo uma fase do roadmap está
  marcada como `In Progress`.
- Resuma, na conclusão, o que foi alterado, o que foi validado e quais
  suposições foram feitas.

## 5. Proibições explícitas sem autorização

É proibido, sem autorização explícita e específica do responsável pelo
projeto, para a ação em questão:

- Criar commits, tags ou branches.
- Executar `git push` ou qualquer publicação remota.
- Fazer deploy em qualquer ambiente (local de produção, staging, cloud).
- Modificar, provisionar ou desativar serviços externos (banco de dados
  gerenciado, filas, provedores de pagamento como Stripe, mapas como
  Mapbox, autenticação como Google OAuth, ou qualquer infraestrutura
  fora do repositório local).
- Instalar, atualizar ou remover dependências fora do escopo
  explicitamente pedido na tarefa corrente.
- Inicializar ferramentas de scaffold (Nx, NestJS CLI, Next.js CLI) fora
  da fase do roadmap que autoriza essa ação.

## 6. Escopo da fase ativa

O repositório evolui fase a fase, conforme
[docs/IMPLEMENTATION_ROADMAP.md](docs/IMPLEMENTATION_ROADMAP.md). Antes
de qualquer alteração, verifique qual fase está `In Progress` (ou, na
ausência de uma, qual foi a última `Completed`) e limite o trabalho
exatamente ao que essa fase autoriza — nunca ao que uma tarefa futura
pareça sugerir implicitamente.

- **Fase 0 — Fundação e revisão documental**: `Completed`.
- **Fase 1 — Yarn 4 e Nx**: `Completed`.
- **Fase 2 — API NestJS (skeleton da API)**: `Completed`. O skeleton
  técnico de `apps/api` (NestJS, Express, Pino, health checks, Problem
  Details, correlation ID, CORS, Helmet, rate limiting) e `libs/config`
  com o entrypoint server-only (`@mockp/config/server`) já estão
  implementados e com revisão técnica aprovada.
- **Fase 3 — Docker, PostGIS, Redis e Prisma**: `Completed` — anterior
  à Fase 4, que também está `Completed` (ver abaixo).
  As Tarefas 3.0 (abertura documental e especificação técnica), 3.1
  (Docker Compose com PostGIS e Redis) e **3.2** (Prisma, schema,
  migration inicial e seed) estão **`Completed`** e aprovadas —
  [ADR 006](docs/adr/006-persistence-and-local-infrastructure.md) e
  [ADR 007](docs/adr/007-multi-tenant-workspace-foundation.md) estão
  ambas `Accepted` (ADR 007 supersede **exclusivamente a modelagem de
  dados** da ADR 006; as decisões de infraestrutura local e pipeline da
  ADR 006 — Docker Compose, Redis, separação de configs Prisma,
  `yarn validate` — continuam válidas e não foram alteradas). A
  infraestrutura local já existe: `docker-compose.yml` com `postgres`
  (`postgis/postgis:18-3.6`) e `redis` (`redis:8.8.2-alpine`), sem
  `container_name`/`profiles`, healthchecks, volumes nomeados
  separados, bancos `mockp` e `mockp_test` criados deterministicamente;
  `DATABASE_URL`/`REDIS_URL` são obrigatórias no `ServerConfig`, e
  `TEST_DATABASE_URL` é exclusiva de testes/scripts. Prisma `7.10.0`,
  seus arquivos de configuração (`prisma.config.ts`,
  `prisma.migrate.config.ts`, `prisma.test.config.ts`,
  `prisma/prisma-config.shared.ts`), `schema.prisma`, a migration
  inicial e o seed **já existem e implementam a modelagem multi-tenant
  de 15 entidades da ADR 007** — validados offline (`db:validate`,
  `db:generate`, typecheck, lint, testes, `yarn validate`) **e em banco
  limpo** (volume PostgreSQL recriado, migration aplicada em `mockp` e
  `mockp_test`, seed idempotente em ambos, 15 tabelas de domínio +
  `_prisma_migrations`, **23 `CHECK`s do domínio Mockp** (24 no total
  do schema `public`, contando `spatial_ref_sys_srid_check`, que
  pertence à extensão PostGIS, não ao domínio), 17 FKs, índices e
  extensões confirmados, provas negativas/positivas executadas em
  transação com rollback em `mockp_test` sem deixar fixtures) —
  auditoria independente confirmou o resultado. Ao final da Tarefa 3.2,
  nenhum `PrismaModule`, `PrismaService`, repository, conexão de
  runtime da API com o banco, readiness real ou Dockerfile da API
  existia ainda — ver abaixo o que a Tarefa 3.3 já entregou desde então.
  **A Tarefa 3.3** (`PrismaModule`/`RedisModule`/repositories por
  agregado, ver ADR 007) está **`Completed`**, executada subtarefa por
  subtarefa (oito no total, definidas na ADR 008 §8), cada uma aprovada
  com autorização explícita própria. **As subtarefas 3.3.1 a 3.3.6 estão
  `Completed` e aprovadas**: **3.3.1** — `RuntimeConfigModule` (único
  módulo global, fornece `SERVER_CONFIG`), `RedisModule` (estático,
  não-global) e `RedisService` (composição sobre `ioredis@6.0.0`,
  conexão lazy, timeouts finitos, erros normalizados via
  `RedisUnavailableError`, shutdown seguro); **3.3.2** — `PrismaService`
  (`@Injectable()`, estende o `PrismaClient` gerado localmente,
  implementa `OnModuleDestroy`) injeta `SERVER_CONFIG` e constrói
  `PrismaPg` usando exclusivamente `config.databaseUrl`, e
  `PrismaModule` (estático, não-global, `providers`/
  `exports: [PrismaService]`); **3.3.3** — composição offline do
  `AppModule` (`RuntimeConfigModule`+`PrismaModule`+`RedisModule`
  wired), incluindo a prova de instância única de `PrismaService`/
  `RedisService` no grafo Nest, exatamente conforme ADR 008 §7.2/§8;
  **3.3.4** — harness de infraestrutura real (`apps/api/test/infra/`,
  target `api:test:integration:infra`, comando raiz
  `yarn validate:infra`, `TRUNCATE` guardado e execução serial
  conforme ADR 008 §7.3/§7.5) e os primeiros testes reais contra
  PostgreSQL/PostGIS e Redis; **3.3.5** — `UserRepository`
  (`createWithCredential`/`createWithAuthIdentity`/`findById`/
  `findByEmail`, ADR 008 §4.1) e `UsersModule`; **3.3.6** —
  `WorkspaceRepository` (`createIndividualWorkspace`/
  `createBrokerageWorkspace`, ambos totalmente atômicos em uma única
  transação, mais `findById`, ADR 008 §4.2) e `WorkspacesModule`. Todos
  esses módulos/repositories já existem no código e já estão
  importados em `AppModule`. **A conexão com Prisma e Redis continua
  exclusivamente lazy nos testes offline**; os testes reais criados a
  partir da 3.3.4 já exercitam PostgreSQL/PostGIS e Redis de verdade
  contra o profile padrão do Compose — isso, por si só, **ainda não
  representava readiness real** até a Tarefa 3.4 (ver fechamento
  abaixo), que passou a fazer `GET /api/v1/health/ready` chamar
  PostgreSQL/PostGIS e Redis de verdade a cada request.
  132 testes unitários, 44 testes de integração offline e 23 testes de
  integração com infraestrutura real confirmados ao final da 3.3.6.
  **A subtarefa 3.3.7** (`PropertyRepository`/`PropertiesModule`,
  `createProperty`/`findByIdInWorkspace`/`updatePropertyStatus`, ADR
  008 §4.3) está **`Completed` e aprovada**: implementação completa,
  commitada isoladamente (`9e0a1dc`, 12 arquivos de código e testes,
  nenhuma alteração documental no mesmo commit), com revisão técnica
  final aprovada para commit antes da criação do commit. **A subtarefa
  3.3.8** (validação integrada e fechamento documental) está
  **`Completed` e aprovada**: validação de ponta a ponta sem nenhum
  achado — HEAD e worktree limpo confirmados, `postgres`/`redis`
  saudáveis, suíte real apontando exclusivamente para `mockp_test`,
  `yarn validate` e `yarn validate:infra` aprovados de ponta a ponta,
  composição do `AppModule` conferida, isolamento entre testes offline
  e reais confirmado, regras de camada do backend (ADR 002) e ausência
  de alterações no contrato público confirmadas, seguidos deste
  fechamento documental. **168 testes unitários, 44 testes de
  integração offline e 52 testes de integração com infraestrutura real
  confirmados ao final da 3.3.8.** **A Tarefa 3.3 está `Completed`.**
  **A Tarefa 3.4** (readiness real e testes de falha das dependências)
  está **`Completed` e aprovada tecnicamente**: `GET /api/v1/health/ready`
  passou a checar PostgreSQL/PostGIS (via `PrismaService`, em uma
  transação com `set_config('statement_timeout', ..., true)`
  parametrizado seguido de `PostGIS_Version()`) e Redis (via
  `RedisService.ping()`, reaproveitado sem alteração) — saudável
  retorna `200` com `checks: { application: 'up', database: 'up',
redis: 'up' }`; falha de qualquer dependência retorna `503` em
  Problem Details, `code: SERVICE_UNAVAILABLE`, sem campo `checks`, com
  `detail` estático identificando qual dependência falhou.
  `GET /api/v1/health/live` permanece independente de ambas.
  `HealthModule` passou a `imports: [PrismaModule, RedisModule]`,
  exatamente como previsto pela ADR 008 §2.4 — nenhum Repository de
  infraestrutura foi criado, nenhuma regra da ADR 002 foi violada, e a
  configuração compartilhada do `PrismaService` não foi alterada
  (**risco residual aceito nesta tarefa**: o timeout do probe garante um
  prazo finito de resposta, mas não cancela necessariamente uma
  tentativa física de conexão PostgreSQL ainda pendente em uma falha
  extrema de rede; `connectionTimeoutMillis` não foi adicionado ao
  `PrismaService` compartilhado). `yarn validate` foi aprovado de ponta
  a ponta (**180 testes unitários e 49 testes de integração offline**,
  cobrindo sucesso, falha individual de cada dependência, resultado de
  PostGIS inválido, falha dupla, ausência de `checks` no `503`,
  correlation ID e isenção de rate limiting). `yarn validate:infra`
  também foi aprovado (**53 testes de integração com infraestrutura
  real**), incluindo um teste real confirmando que a forma parametrizada
  de `set_config` funciona contra o PostgreSQL/PostGIS instalados. Além
  dos testes automatizados, uma validação operacional manual —
  autorizada especificamente para essa verificação — parou e reiniciou
  `redis` e `postgres` individualmente (nunca os dois ao mesmo tempo,
  nunca `docker compose down`/`down -v`) contra a API local, confirmando
  `503`/`SERVICE_UNAVAILABLE` com `detail` identificando a dependência
  correta e liveness `200` durante cada indisponibilidade, e recuperação
  para `200` após cada restart; ambos os containers foram restaurados
  saudáveis ao final. **A Tarefa 3.4 está `Completed`.**
  **A Tarefa 3.5** (Dockerfile da API) está **`Completed` e aprovada
  tecnicamente**: [apps/api/Dockerfile](apps/api/Dockerfile)
  multi-stage (`build`/`runtime`), imagem-base fixada
  (`node:24.18.0-bookworm-slim`) e Yarn `4.12.0` (via Corepack) nos dois
  stages, contexto de build na raiz do monorepo, `HUSKY=0` no
  `yarn install --immutable`, Prisma Client gerado e API compilada via
  `yarn nx run api:build` sem exigir `DATABASE_URL` no build, stage
  final rodando como usuário não-root (`node`), sem depender de
  `node_modules`/arquivos do host, com a lista mínima de arquivos Prisma
  da ADR 006 (nunca `prisma.test.config.ts` nem testes), `CMD` iniciando
  somente `node dist/apps/api/src/main.js` (sem migration automática no
  boot), e [.dockerignore](.dockerignore) correspondente. Validado:
  `yarn validate` aprovado; build real da imagem a partir da raiz;
  container iniciado contra o `postgres`/`redis` locais já existentes
  (via `host.docker.internal`, sem parar/recriar nenhum dos dois) com
  `GET /api/v1/health/live` e `GET /api/v1/health/ready` respondendo
  `200`/saudável; usuário não-root confirmado (`whoami` → `node`);
  ausência de `prisma.test.config.ts` e de qualquer fonte TypeScript não
  compilado na imagem confirmada; `/proc/1/cmdline` confirmado como
  exatamente `node dist/apps/api/src/main.js`, sem wrapper de migration;
  comando explícito `yarn workspace api prisma migrate deploy --config
prisma.migrate.config.ts` executado dentro da imagem **somente**
  contra `mockp_test` (host e nome do banco confirmados antes),
  idempotente (`No pending migrations to apply`); container de teste
  encerrado ao final, sem alterar o profile `full` do Compose. Duas
  lacunas factuais da ADR 006 foram corrigidas durante a validação (não
  são mudanças de decisão): o caminho real do `CMD` é
  `dist/apps/api/src/main.js` (não `dist/apps/api/main.js`); e o cache
  do Corepack, por padrão isolado por `$HOME`, precisou de
  `COREPACK_HOME` fixo e de `/app` com posse ajustada para `node` para
  que nenhuma chamada de rede/erro de permissão ocorresse em runtime —
  ver ADR 006, seção "Dockerfile da API e Prisma". **A Tarefa 3.6**
  (validação integrada e fechamento documental) está **`Completed` e
  aprovada tecnicamente**, com o checklist de ponta a ponta da Fase 3
  aprovado sem nenhum item pendente ou bloqueado:
  - **Provas novas desta rodada**: `docker compose ps` confirmou
    `postgres`/`redis` saudáveis, sem parar ou reiniciar nenhum dos
    dois; a imagem de `apps/api` foi reconstruída a partir da raiz do
    monorepo (manifest idêntico ao build da 3.5 — build reprodutível) e
    iniciada em um container novo e temporário, com
    `GET /api/v1/health/live`/`GET /api/v1/health/ready` respondendo
    `200`, usuário `node` confirmado, e `/proc/1/cmdline` confirmando
    ausência de migration automática no boot;
    `db:migrate:deploy:test`/`db:seed:test` executados contra
    `mockp_test` de forma idempotente (`No pending migrations to
apply` / `Seed complete: 2 role(s) in the catalog`); índice GiST em
    `addresses.location` confirmado via `pg_indexes`; as 15 tabelas de
    domínio da ADR 007 confirmadas em `mockp_test` via `\dt`, sem
    nenhuma tabela fora do núcleo revisado; `yarn validate` e
    `yarn validate:infra` reaprovados de ponta a ponta (mesmas
    contagens da 3.4 — 180 testes unitários, 49 de integração offline,
    53 de integração real; nenhum teste novo nesta tarefa). O container
    de teste temporário foi encerrado ao final; nenhum volume foi
    recriado ou removido, nenhuma dependência foi parada manualmente
    nesta rodada, e o profile `full` não foi executado.
  - **Provas históricas reaproveitadas, não repetidas**: migration
    aplicada em banco limpo (Tarefa 3.2, volume PostgreSQL recriado do
    zero) e a queda real de PostgreSQL/Redis fazendo
    `GET /api/v1/health/ready` responder `503` (Tarefa 3.4, validação
    operacional manual, parada/recuperação individual de cada serviço).
  - **Divergência histórica sinalizada, não corrigida na ADR 006**: a
    ADR 006 contém referências ao catálogo original de **4 papéis
    globais** (`RoleName { CUSTOMER AGENT MANAGER ADMIN }`), parte da
    modelagem de dados que a ADR 007 supersede explicitamente. O seed
    atual, com **2 papéis globais** (`CUSTOMER`, `ADMIN`), está correto
    e reflete a ADR 007 — as menções a "4 papéis" na ADR 006 são
    registro histórico da decisão anterior, não o contrato atual, e a
    ADR 006 **não foi alterada** nesta rodada; permanece `Accepted`.
    **A Tarefa 3.6 está `Completed`. A Fase 3 — Docker, PostGIS, Redis e
    Prisma — está `Completed`**. **A Fase 4 — Worker e BullMQ — está
    `Completed`** (ver bullet próprio abaixo).
- Prisma `7.10.0`, `schema.prisma`, a migration inicial e o seed (a
  fundação multi-tenant da ADR 007) já existem e estão validados;
  `PrismaModule`/`PrismaService`, `RedisModule`/`RedisService`,
  `UserRepository`/`UsersModule`, `WorkspaceRepository`/
  `WorkspacesModule` e `PropertyRepository`/`PropertiesModule` (3.3.7)
  também já existem e já estão em `AppModule`. A partir da Tarefa 3.4,
  a conexão runtime real da API **em produção** com PostgreSQL/PostGIS e
  Redis já existe através do indicador de readiness
  (`GET /api/v1/health/ready`); nenhum Controller de domínio expõe
  `UserRepository`/`WorkspaceRepository`/`PropertyRepository` via HTTP
  ainda (isso pertence a fases posteriores), então esses repositories
  continuam exercitados apenas pelos testes (offline e reais desde a
  3.3.4). O Dockerfile da API já existe desde a Tarefa 3.5
  ([apps/api/Dockerfile](apps/api/Dockerfile)); PostgreSQL/PostGIS e
  Redis já existem como containers locais (Docker Compose) e já são
  exercitados de verdade pela suíte `yarn validate:infra` desde a
  3.3.4.
- **Fase 4 — Worker e BullMQ**: `Completed` — anterior à Fase 5, a
  fase corrente (ver o bullet da Fase 5 abaixo). As subtarefas 4.1
  (`libs/queue` e `@mockp/config/worker`), 4.2 (skeleton de
  `apps/worker`), 4.3 (conexão Redis própria do worker e
  `SystemPingProcessor`, via `@nestjs/bullmq`) e 4.4 (comando interno
  da API que publica `system.ping`, `apps/api/src/queue/**`, alvo Nx
  `queue:smoke:system-ping`, nunca um endpoint HTTP) estão
  **`Completed`** e aprovadas. **A subtarefa 4.5 (teste de ponta a
  ponta em `yarn validate:infra`) também está `Completed` e aprovada
  tecnicamente**: `SystemPingModule` **agora está importado em
  `AppModule.forRoot()`** do worker (o `setInterval` interino da 4.2
  foi removido — o `Worker` real do BullMQ mantém o processo vivo
  sozinho); o logging do `SystemPingProcessor` foi corrigido para a
  chamada objeto-primeiro (mesmo padrão da 4.4), com o caminho de erro
  não serializando mais o `Error` bruto; um `QueueRedisConnectionCloser`
  próprio do worker (mesmo padrão do da API) fecha de verdade a conexão
  `ioredis` do worker no shutdown — provado por um teste que observa
  `status === 'end'`, não só que `app.close()` resolveu. O teste E2E
  real (`apps/api/test/infra/queue/system-ping.infra.spec.ts`) publica
  via `SystemPingPublisher` real, um worker real (processo separado)
  consome via Redis do Compose, e confirma payload/`requestId`/estado
  `completed` — isolado num banco lógico Redis dedicado (`/1`,
  reservado por convenção, não por garantia técnica), com uma
  verificação **somente leitura e fail-closed** antes de iniciar o
  worker (recusa rodar se a fila `system` desse banco já tiver job
  pendente, sem processar nem remover nada de terceiros — comprovado
  com um job decoy). Uma prova separada
  (`system-ping-retry.infra.spec.ts`) confirma retry/backoff com
  `Queue`/`Worker` exclusivos do teste, numa fila com nome único,
  nunca a fila `system`, comparando os atrasos medidos contra o valor
  exato da fórmula de backoff exponencial do BullMQ. Limpeza sempre
  restrita ao que o próprio teste criou, nunca `FLUSHDB`/`KEYS *`/
  `obliterate` na fila compartilhada. `yarn validate` continua 100%
  offline; `yarn validate:infra` cobre os dois testes reais novos.
  **Dois riscos residuais distintos permanecem**: (1) o isolamento por
  banco lógico é convencional, não uma garantia técnica — uma execução
  concorrente ou um producer real apontando deliberadamente para o
  banco 1 ainda poderiam colidir com o guard; (2) a prova de `SIGTERM`
  real entregue a um processo containerizado em Linux estava pendente
  à época da 4.5 — no Windows o sinal não chega ao handler JS (achado
  da 4.2) — e foi entregue na Tarefa 4.6 (ver abaixo).
  **A subtarefa 4.6 (Dockerfile do worker) está `Completed` e aprovada
  tecnicamente**, em duas partes distintas: **4.6-A** — ajuste do
  [apps/api/Dockerfile](apps/api/Dockerfile) para o grafo atual de
  quatro workspaces e `@mockp/queue` (o build da imagem da API estava
  quebrado desde a 4.4 por `yarn install --immutable`), com rebuild,
  `live`/`ready` `200`, usuário `node`, sem migration no boot e
  `migrate deploy` explícito idempotente contra `mockp_test`
  validados; **4.6-B** — [apps/worker/Dockerfile](apps/worker/Dockerfile)
  multi-stage, não-root, com build real, consumo real de `system.ping`
  dentro do container (preflight fail-closed: mesma instância Redis,
  banco lógico 1, sem jobs preexistentes) e `SIGTERM` real em Linux com
  saída `0` em 478 ms, sem `--init` e sem `SIGKILL`. O `node_modules`
  completo da imagem do worker inclui pacotes Prisma inertes (sem
  import/acesso a banco pelo worker, provado); a imagem de teste foi
  mantida. A divergência factual da ADR 006 (seção "Dockerfile da API e
  Prisma" lista só `libs/config`) foi apenas reportada — a ADR não foi
  alterada. Riscos residuais: `host.docker.internal` só no Docker
  Desktop; isolamento por banco lógico segue convencional; grafo de
  workspaces duplicado nos dois Dockerfiles; imagem grande.
  **A subtarefa 4.7 (validação integrada e fechamento documental) está
  `Completed` e aprovada tecnicamente.** Evidências **novas** da
  rodada: `yarn validate` com cache do Nx desligado (`api` 192,
  `worker` 15, `config` 41, `queue` 2 testes unitários; 49 de
  integração offline na API) e `yarn validate:infra` (55 testes na API,
  2 no worker) aprovados; greps de imports cruzados/Prisma/segredos
  limpos; nenhum endpoint nem entrada Swagger para `system.ping`
  (`swagger.spec.ts` e o `/docs-json` da imagem reconstruída listam só
  os dois endpoints de health; nenhum `openapi.json` versionado é
  pressuposto); ciclo completo de imagens (API e worker, tags novas
  `4.7-test`, anteriores preservadas) com preflight fail-closed (mesma
  instância Redis, banco 1), consumo real de `system.ping` no container
  e `SIGTERM` real em Linux com saída `0` em 488 ms, sem `--init` e sem
  `SIGKILL`; `migrate deploy` repetido contra `mockp_test` só depois
  de verificar, sem expor credenciais, `current_database()` e
  `system_identifier` pela conexão real (a primeira passagem não teve
  essa consulta prévia). Evidências **históricas** reaproveitadas, não
  repetidas: SIGTERM no Windows (4.2), job decoy do guard (4.5), banco
  limpo (3.2) e queda de dependências (3.4). **Correlation ID**: a
  fase comprovou o `requestId` do comando interno até o worker, **não**
  a propagação de `X-Request-Id` HTTP até um job (nenhum endpoint HTTP
  enfileira jobs). Riscos residuais: isolamento por banco lógico
  convencional; `host.docker.internal` só no Docker Desktop; grafo de
  workspaces duplicado nos Dockerfiles; imagens grandes com pacotes
  Prisma inertes no worker; Dockerfile do worker não exercitado no
  Compose `full` (Fase 9); divergência factual da ADR 006 apenas
  reportada, ADR inalterada. **A Fase 4 está `Completed`** (ao fechá-la
  nenhuma fase estava `In Progress`; a Fase 5 foi aberta depois, ver o
  bullet seguinte). `apps/web` continua não existindo neste
  repositório.
  Ver [docs/IMPLEMENTATION_ROADMAP.md](docs/IMPLEMENTATION_ROADMAP.md),
  Fase 4, para o detalhamento completo subtarefa por subtarefa.
- **Fase 5 — OpenAPI e api-client**: `In Progress` — fase corrente,
  subtarefas **5.0** (abertura documental), **5.1** (spike), **5.2**
  (scaffold de `libs/api-client` e dependências, sem API pública) e
  **5.3** (Dockerfiles e o quinto workspace) `Completed`. As subtarefas
  5.4 a 5.12 estão `Pending` e **cada uma exige autorização explícita e
  individual**. As imagens Docker da API e do worker estiveram
  conscientemente quebradas entre a 5.2 e a 5.3 (o `yarn.lock` ganhou o
  quinto workspace) e foram consertadas na 5.3 (`COPY` de
  `libs/api-client/package.json` nos dois stages de cada Dockerfile,
  provado com build real, `yarn workspaces list` no runtime, API e
  worker em container e `SIGTERM` com saída `0`); 5.2 e 5.3 devem
  entrar no mesmo commit. As decisões estão registradas na
  [ADR 009](docs/adr/009-openapi-contract-and-api-client.md)
  (`Proposed`; complementa a ADR 001 sem alterá-la). O spike resolveu as
  condicionais: o gerador é **compilado pelo `api:build` e executado com
  `node` sobre `dist`, nunca com `tsx`** (o esbuild não emite
  `emitDecoratorMetadata`), `preview: true` foi confirmado, o warning de
  peer `typescript ^5.x` × `6.0.3` do `openapi-typescript` virou
  exceção documentada, e `libs/api-client` é CommonJS. As versões exatas
  foram gravadas na 5.2 (`openapi-typescript` 7.13.0 como
  `devDependency` e `openapi-fetch` 0.17.0 como `dependency`). Regra
  central: `contract:generate` escreve os artefatos versionados por
  execução explícita e nunca entra em `yarn validate`, no hook ou em
  pipeline; `contract:check` é somente leitura e compara/falha. Sem
  override de peer, sem `--legacy-peer-deps`, sem troca de ferramenta e
  sem rebaixar o TypeScript. Os Dockerfiles só são ajustados à quinta
  workspace na 5.3 (já feito). Ver
  [docs/IMPLEMENTATION_ROADMAP.md](docs/IMPLEMENTATION_ROADMAP.md),
  Fase 5.
- Não crie `apps/web`, outras `libs/*` de produto, Next.js,
  autenticação, domínio de negócio ou qualquer outra peça de fases
  posteriores à Fase 5, e não antecipe entregáveis de fases futuras
  (incluindo a Fase 6 — Tailwind, `libs/ui` e Storybook, `Pending`, e
  qualquer subtarefa da Fase 5 além da já autorizada), mesmo que
  solicitado de forma implícita por uma tarefa, a menos que essa tarefa
  autorize explicitamente o avanço.
- Não crie commits, branches, remotes ou publique nada, a menos que a
  tarefa autorize explicitamente essa ação.

## 7. Husky (proteção local, não substitui CI)

- O repositório usa Husky para rodar um hook `pre-commit` local que
  executa `yarn validate` antes de qualquer commit. Isso é uma
  **proteção de desenvolvimento**, não um substituto de CI — o mesmo
  `yarn validate` deve ser rodado (ou seu equivalente) em qualquer
  pipeline de CI que vier a ser configurado.
- Não use `git commit --no-verify` para pular o hook, salvo autorização
  explícita e específica do responsável pelo projeto para aquele commit
  em particular.
- Não substitua `yarn validate` no hook por um subconjunto de comandos
  (ex.: só lint) — o hook deve continuar chamando exatamente
  `yarn validate`.
- Em ambientes sem Git (ex.: imagens Docker, alguns pipelines de CI que
  fazem checkout raso), `yarn install` pode falhar ao tentar configurar
  o Husky via `prepare`. Nesses ambientes, defina a variável de
  ambiente `HUSKY=0` antes de instalar dependências para desabilitar a
  instalação/execução dos hooks (ex.: `HUSKY=0 yarn install`).
