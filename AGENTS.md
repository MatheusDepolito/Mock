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
- **Fase 3 — Docker, PostGIS, Redis e Prisma**: `In Progress`. As
  Tarefas 3.0 (abertura documental e especificação técnica), 3.1
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
  auditoria independente confirmou o resultado. **Nenhum
  `PrismaModule`, `PrismaService`, repository, conexão de runtime da
  API com o banco, readiness real ou Dockerfile da API existe ainda.**
  **A Tarefa 3.3** (`PrismaModule`/`RedisModule`/repositories por
  agregado, ver ADR 007) está **`In Progress`**, executada subtarefa
  por subtarefa (oito no total, definidas na ADR 008 §8), cada uma com
  autorização explícita própria. **A subtarefa 3.3.1** (`RuntimeConfigModule` e `RedisModule`/`RedisService` com testes offline) está **`Completed`
  e aprovada**: `RuntimeConfigModule` (único módulo global, fornece
  `SERVER_CONFIG`), `RedisModule` (estático, não-global) e
  `RedisService` (composição sobre `ioredis@6.0.0`, conexão lazy,
  timeouts finitos, erros normalizados via `RedisUnavailableError`,
  shutdown seguro) já existem no código e já estão importados em
  `AppModule`. **A integração com o Redis é exclusivamente lazy** —
  nenhum teste offline abre socket real, e sua mera existência **não
  representa readiness real** (isso continua sendo exclusivamente a
  Tarefa 3.4). **Nenhum `PrismaModule`, `PrismaService`, repository ou
  Dockerfile da API existe ainda.** **Somente a subtarefa 3.3.2**
  (`PrismaModule` e `PrismaService` com testes offline, conforme ADR 008)
  **está autorizada a começar**; as subtarefas 3.3.3 a 3.3.8 **ainda
  não estão autorizadas**. **As Tarefas 3.4 a 3.6** (readiness real,
  Dockerfile da API, validação integrada) **continuam bloqueadas** —
  cada uma só começa depois que a anterior atender seus critérios de
  aceite (ver [docs/IMPLEMENTATION_ROADMAP.md](docs/IMPLEMENTATION_ROADMAP.md),
  Fase 3).
- Prisma `7.10.0`, `schema.prisma`, a migration inicial e o seed (a
  fundação multi-tenant da ADR 007) já existem e estão validados —
  mas ainda não existem `PrismaModule`, `PrismaService`, repositories,
  conexão runtime da API com o banco, Dockerfile da API, `apps/worker`
  ou `apps/web`/frontend neste repositório. PostgreSQL/PostGIS e Redis
  já existem como containers locais (Docker Compose), mas nenhum
  código da API os acessa ainda.
- Não crie `apps/web`, `apps/worker`, outras `libs/*` de produto,
  Next.js, Docker, autenticação, domínio de negócio ou qualquer outra
  peça de fases posteriores a Fase 3, e não antecipe entregáveis de
  fases futuras, mesmo que solicitado de forma implícita por uma
  tarefa, a menos que essa tarefa autorize explicitamente o avanço de
  fase.
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
