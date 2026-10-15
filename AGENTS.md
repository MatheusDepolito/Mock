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
  projetos e `api:test:integration`) e, desde a Fase 5 (subtarefa 5.10),
  os dois `contract:check` (`api` e `api-client`, somente leitura, sem
  cache). É o mesmo comando que o hook
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
pareça sugerir implicitamente. O roadmap é a **fonte única do status**
das fases e subtarefas; este documento guarda regras, não histórico.

Fases concluídas (`Completed`), com o detalhamento no roadmap:

- **Fase 0 — Fundação e revisão documental**: `Completed`
  ([roadmap](docs/IMPLEMENTATION_ROADMAP.md#fase-0--fundação-e-revisão-documental)).
- **Fase 1 — Yarn 4 e Nx**: `Completed`
  ([roadmap](docs/IMPLEMENTATION_ROADMAP.md#fase-1--yarn-4-e-nx-bootstrap-do-monorepo)).
- **Fase 2 — API NestJS (skeleton da API)**: `Completed`
  ([roadmap](docs/IMPLEMENTATION_ROADMAP.md#fase-2--api-nestjs-skeleton-da-api)).
- **Fase 3 — Docker, PostGIS, Redis e Prisma**: `Completed`; ADR 006,
  007 e 008 `Accepted` (a ADR 007 supersede somente a modelagem de
  dados da ADR 006); `TEST_DATABASE_URL` é exclusiva de testes/scripts
  ([roadmap](docs/IMPLEMENTATION_ROADMAP.md#fase-3--docker-postgis-redis-e-prisma)).
- **Fase 4 — Worker e BullMQ**: `Completed`
  ([roadmap](docs/IMPLEMENTATION_ROADMAP.md#fase-4--worker-e-bullmq)).

Fase ativa:

- **Fase 5 — OpenAPI e api-client**: `In Progress` — fase corrente; o
  estado das subtarefas está no
  [roadmap](docs/IMPLEMENTATION_ROADMAP.md#fase-5--openapi-e-api-client)
  e as decisões na
  [ADR 009](docs/adr/009-openapi-contract-and-api-client.md). Cada
  subtarefa exige autorização explícita e individual. Regras desta
  fase:
  - `contract:generate` escreve os artefatos versionados por execução
    explícita e nunca entra em `yarn validate`, no hook ou em
    pipeline; `contract:check` é somente leitura e compara/falha.
  - O gerador é compilado pelo `api:build` e executado com `node`
    sobre `dist`, nunca com `tsx`.
  - Sem override de peer, sem `--legacy-peer-deps`, sem troca de
    ferramenta e sem rebaixar o TypeScript.
  - Os riscos residuais aceitos e seus gatilhos estão em
    [Riscos residuais e gatilhos](docs/IMPLEMENTATION_ROADMAP.md#riscos-residuais-e-gatilhos).

Limites de escopo:

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

## 8. Fluxo por subtarefa

Fluxo operacional usado na execução do roadmap. Detalha as seções 1 a 7;
não as substitui nem relaxa nenhuma delas.

1. **Autorização**: cada subtarefa só começa com autorização explícita e
   individual do responsável, que define escopo, provas, condições de
   parada e se há commit.
2. **Estado inicial**: confirme HEAD, branch, `git status` e stash
   antes de qualquer alteração.
3. **Investigação somente leitura primeiro** (seção 3), registrando as
   premissas.
4. **Escopo estrito**: altere apenas o que a autorização cobre; o que
   está fora do escopo permanece intacto.
5. **Provas e validações**: produza as provas pedidas e rode as
   validações da seção 4 (`yarn validate`, e `yarn validate:infra`
   quando o escopo tocar infraestrutura real).
6. **Falha de prova**: pare, reporte as opções e não decida sozinho;
   nenhum workaround e nenhum teste ou regra enfraquecido.
7. **Commit só se autorizado**: staging arquivo a arquivo, hook
   `pre-commit` executando (seção 7), sem `--no-verify`, `--amend`,
   push, reset, rebase ou force, com a mensagem indicada na autorização.
8. **Relatório final** em formato fixo: Commit; Arquivos; Provas;
   Validações; Desvios e suposições; Estado.
9. **Parar**: a próxima subtarefa exige nova autorização.
10. **Documentação**: o status das fases e subtarefas é registrado
    somente no roadmap; este documento e o README apontam para ele.
