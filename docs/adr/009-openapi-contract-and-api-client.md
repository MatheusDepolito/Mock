# ADR 009 — Contrato OpenAPI versionado e `libs/api-client`

## Status

Proposed

Esta ADR é aberta pela subtarefa 5.0 da Fase 5
([docs/IMPLEMENTATION_ROADMAP.md](../IMPLEMENTATION_ROADMAP.md)). Ela
**complementa** a [ADR 001](001-rest-openapi.md) — que decidiu REST com
OpenAPI como fonte de verdade do contrato, `openapi-typescript` e
`openapi-fetch` — e **não a altera nem a supersede**. Passa a
`Accepted` somente no fechamento da Fase 5. O spike (subtarefa 5.1) foi
concluído e resolveu as decisões condicionais (ver "Resultado do spike
5.1"); os valores de D8 foram aprovados e gravados na 5.2, restando a
confirmação das decisões nas subtarefas seguintes. As ADRs 001–008 permanecem
inalteradas.

## Contexto

A ADR 001 e a seção 6 de
[docs/TARGET_ARCHITECTURE.md](../TARGET_ARCHITECTURE.md) fixam _o que_
o contrato é (gerado a partir dos DTOs/controllers do NestJS, `openapi.json`
determinístico e versionado, tipos gerados com `openapi-typescript`,
cliente base com `openapi-fetch`, drift detectado por `contract:generate`
e `contract:check`), mas deixam em aberto detalhes de implementação com
consequência duradoura: onde o `openapi.json` mora, como é serializado
byte a byte, onde ficam os tipos gerados, como o gerador sobe o
`AppModule` sem conexões reais, como `contract:check` entra em
`yarn validate` sem corrigir drift silenciosamente, e como o projeto
trata uma ferramenta que declara peer `typescript ^5.x` num workspace
com TypeScript `6.0.3`.

Fatos do código que moldam a decisão (verificados na abertura da fase):

- `configureApp()` ([configure-app.ts](../../apps/api/src/app/configure-app.ts))
  mistura o setup HTTP (prefixo `api`, versionamento URI `1`, pipes) com
  o `DocumentBuilder`/`SwaggerModule`; os paths do contrato dependem do
  primeiro.
- Hoje o contrato tem duas operações (`GET /api/v1/health/live` e
  `/ready`), só com `@ApiOkResponse`; nenhum Problem Details nem header
  está documentado, e a `info.description` ainda cita "skeleton (Fase 2)".
- `PrismaService`/`RedisService` são lazy, mas o `AppModule` importa o
  Prisma Client **gerado** (git-ignorado), então qualquer geração exige
  `db:generate` antes.
- `format:check` (Prettier) varre o repositório inteiro; o ESLint já
  ignora `**/generated/**`; `tsconfig.base.json` usa `skipLibCheck: true`.
- Ambos os Dockerfiles copiam o `package.json` de cada workspace; um
  quinto workspace (`libs/api-client`) exige acompanhar o grafo (mesmo
  padrão da subtarefa 4.6-A).

## Decisão

Cada decisão carrega o estado na abertura da fase: **aprovada**,
**aprovada condicional** ao spike 5.1, ou **regra aprovada com valores
pendentes**. A numeração segue o plano técnico da Fase 5 aprovado pelo
responsável do projeto (não existe D6 nesse plano).

1. **D1 — Local do `openapi.json` (aprovada).**
   `libs/api-client/openapi/openapi.json`. O cliente fica autocontido,
   sem aresta de projeto Nx `api-client → api`; o alvo de geração da API
   escreve fora do próprio projeto, com saída declarada.
2. **D2 — Tipos gerados (aprovada).**
   `libs/api-client/src/generated/schema.d.ts`, com verificação
   adicional de que o arquivo compila sem depender de `skipLibCheck`
   (medido no spike 5.1 com resultado positivo; repetir sobre o arquivo
   real na 5.8).
3. **D3 — Gerador (aprovada; alterada pelo spike 5.1 para a opção B).**
   O gerador fica em `apps/api/src/contract/`, é **compilado pelo
   `api:build`** (tsc, com `emitDecoratorMetadata`) e **executado com
   `node` sobre o `dist`**, **nunca com `tsx`**: o esbuild não emite
   metadata, e sob `tsx` um `@ApiProperty()` sem `type` explícito quebra
   a geração (`A circular dependency has been detected`) enquanto a
   injeção de dependências por tipo falha em silêncio — ou seja, o
   gerador divergiria do runtime. Os alvos de contrato da API dependem
   de `build`. O gerador usa `AppModule.forRoot(<config sintética
fixa>)` com `NestFactory.create(…, { logger: false, preview: true })`
   e sem `listen()`/`init()`. `preview: true` está **confirmado**:
   documento idêntico ao gerado sem `preview` (inclusive ao documento
   que o `configureApp` real entrega ao Swagger), nenhuma chamada a
   `net.Socket.connect`/`net.connect`/`tls.connect`, nenhum `listen`, e
   os construtores de `PrismaService`/`RedisService` não são executados.
   O que está provado sobre o ambiente é a **independência**: dois
   ambientes diferentes produzem o mesmo documento; **não se afirma**
   "zero leituras de `process.env`" (código de biblioteca enumera o
   ambiente). Na 5.6, além do teste permanente de zero sockets, é
   preciso verificar explicitamente que o transformador do Vitest
   também injeta as dependências no teste de equivalência com o
   `/docs-json` (o spike mediu o comportamento só do `tsx`/esbuild).
4. **D4 — Serialização canônica (aprovada).**
   Chaves de todos os objetos ordenadas por code point, ordem de arrays
   **preservada** (tem semântica: `required`, `enum`, `tags`,
   `parameters`), `JSON.stringify(x, null, 2)` mais um único `\n`
   final, UTF-8 sem BOM, sem `\r`.
5. **D5 — Artefatos gerados no Prettier e no Git (aprovada).**
   `.prettierignore` e `.gitattributes` (`eol=lf`) para o
   `openapi.json` e o `schema.d.ts`; o determinismo é provado por
   testes de bytes, não por formatter. Aplicado na 5.6.
6. **D7 — Peer `typescript ^5.x` × TypeScript `6.0.3` (exceção
   concedida; condição provada no spike 5.1).**
   O warning de peer do `openapi-typescript` (`YN0060`) é aceito como
   **exceção documentada**, porque o spike provou os quatro pontos
   exigidos: execução sem exceção; saída idêntica em duas execuções;
   `schema.d.ts` compilando com as flags estritas do workspace **sem**
   depender de `skipLibCheck` (verificado com controle negativo: um erro
   injetado no `.d.ts` é acusado); e uso real com `openapi-fetch`. O
   warning permanece, e vale o gatilho de revisão abaixo. Na 5.2, no
   workspace `libs/api-client`, o aviso aparece como `YN0002` ("não
   fornece `typescript`", faixa `^5.x`) e não como o `YN0060` do spike,
   porque o workspace não lista `typescript` como dependência própria;
   nenhum dos dois virou erro no `yarn install --immutable`. Nenhuma versão
   do `openapi-typescript` verificada declara suporte a TypeScript 6: a
   `latest` é a 7.13.0 (peer `^5.x`), e as 7.9.1, 7.10.1 e 7.12.0
   também declaram `^5.x`; não há versão mais nova nem tag `next`
   posterior. Proibidos (inalterado): override/`resolutions`,
   `--legacy-peer-deps`, troca de ferramenta e rebaixar o TypeScript.
7. **D8 — Versões (aprovada e gravada na 5.2).**
   Versões **exatas**, sem `^` nem `~` (ver ADR 005):
   `openapi-typescript` **7.13.0** como `devDependency` de
   `libs/api-client`; `openapi-fetch` **0.17.0** como `dependency` (a
   versão do uso real do item (d) do spike; a 0.16.0, helpers
   `^0.0.15`, ficou como alternativa não adotada). `tslib` 2.8.1 consta
   em `dependencies` apenas por espelhar o molde de `libs/queue`
   (`importHelpers`); já estava resolvido no `yarn.lock`.
8. **D9 — Problem Details (aprovada).** Um único `ProblemDetailsDto`
   (`code` enum dos cinco `ProblemCode`; `errors` opcional), com
   descrição por resposta. **Regra de implementação (spike 5.1):** a
   resposta de erro usa **somente `content`**
   (`{ 'application/problem+json': { schema: { $ref } } }`) com
   `@ApiExtraModels(ProblemDetailsDto)`; **nunca `type` junto com
   `content`** — o `type` vence e o content type volta a
   `application/json`. Não usar `@ApiProduces` por operação (vale para
   a operação inteira e rotularia o 200 também).
9. **D10 — Status documentados (aprovada).** `live`: 200 e 500;
   `ready`: 200, 503 e 500. Nada além do que o código pode devolver.
10. **D11 — `X-Request-Id` (aprovada).** Documentado em todas as
    respostas (`headers` do `@ApiResponse`/`@ApiOkResponse`) e como
    parâmetro de request opcional (`@ApiHeader`, `in: header`,
    `required: false`); ambos confirmados no `@nestjs/swagger` 11.4.7.
11. **D12 — `operationId` e descrição (aprovada).** `operationId`
    explícitos (`health_live`/`health_ready`) e `info.description`
    atualizada antes do primeiro spec versionado. O `operationId`
    padrão atual (`HealthController_live_v1`) é substituído por eles.
12. **D13 — Forma do cliente (aprovada).** Factory
    `createApiClient({ baseUrl, fetch? })` sobre `createClient<paths>`
    e re-exports de tipos; sem hooks do TanStack Query, sem singleton,
    sem autenticação, sem DTOs manuais.
13. **D14 — Registro (aprovada).** Esta ADR, `Proposed` na abertura,
    `Accepted` no fechamento da fase.
14. **D15 — Dockerfiles (aprovada).** Ajuste na subtarefa 5.3,
    imediatamente após a 5.2 e no mesmo commit; entre 5.2 e 5.3 as
    imagens ficaram conscientemente quebradas (o `yarn.lock` ganhou o
    quinto workspace). A 5.3 foi concluída: só o `COPY` de
    `libs/api-client/package.json` nos stages `build` e `runtime` de
    cada Dockerfile, provado com build real e execução das duas
    imagens.
15. **D16 — `yarn validate` (aprovada).** `contract:check` é acrescentado
    a `validate:nx`; o hook Husky continua chamando exatamente
    `yarn validate`. `contract:generate` **nunca** entra em `yarn
validate`, no hook ou em pipeline: é execução explícita que escreve
    os artefatos, para que o drift nunca seja corrigido em silêncio
    antes da checagem. `contract:check` é somente leitura (gera em
    memória, compara bytes, nunca escreve no repositório) e começa com
    `cache: false`.
16. **D17 — Provas (aprovada).** Permanentes: função pura de comparação,
    teste de não escrita com `fs` observado, módulo Nest descartável
    dentro do teste que prova drift do pipeline. Pontual (subtarefa
    5.11, autorização própria): cópia descartável fora do repositório
    com um DTO real alterado; não vira teste de CI.
17. **D18 — Formato de módulo de `libs/api-client` (condição atendida;
    CommonJS).** Espelha `libs/queue` (CommonJS): o spike provou que
    `require()` de `openapi-typescript`, `openapi-fetch` e
    `openapi-typescript-helpers` funciona no Node 24.18. Nuance: o
    `openapi-typescript` só carrega via `require(esm)` do Node (sua
    dependência `parse-json` é ESM-only) e falha com
    `ERR_REQUIRE_ESM` se `require(esm)` for desativado; o
    `openapi-fetch` tem build CJS verdadeiro. Como o `openapi-typescript`
    só roda em script de geração (nunca em runtime), o **script de
    geração dos tipos usa `import` (`.mjs`)**; o repositório já exige
    Node `>=24.18.0 <25`.

### Resultado do spike 5.1

O spike rodou fora do repositório (repo comprovadamente inalterado:
HEAD, `git status`, hash do `git diff`, `yarn.lock`, `package.json` e
`node_modules` idênticos antes e depois) e **nenhuma condição de parada
disparou**:

- **`preview: true`** (D3): documento idêntico com e sem `preview`, em 8
  processos (4 variações × 2 ambientes) e mais 3 com `TZ`/`LANG`/`cwd`
  diferentes; zero sockets, zero `listen`/`init`; construtores dos
  providers não executados em `preview`.
- **Swagger** (D9/D11): `content` + `headers` e `@ApiHeader` funcionam;
  `type` + `content` juntos perdem o `content type` (ver D9).
- **`openapi-typescript` 7.13.0 × TS 6.0.3** (D7): os quatro pontos
  provados; o `YN0060` permanece.
- **Módulos** (D18): `require()` funciona no Node 24; ver a nuance em D18.
- **Determinismo** (D4): documento bruto idêntico entre processos;
  canonicalizado idêntico; 200 de 200 embaralhamentos de chaves dão a
  mesma saída; o único array multi-elemento do documento atual são dois
  `required`, com ordem preservada.
- **`tsx`/esbuild**: sem `emitDecoratorMetadata` — causa da mudança de
  D3. Além disso, o alvo `queue:smoke:system-ping` resolve
  `@mockp/config`/`@mockp/queue` para `dist` (ignorado pelo Git, ausente
  num checkout limpo); a resolução para as fontes `.ts` exige
  `--conditions=development`. O gerador compilado em `dist` herda a
  necessidade de `^build` (`api:build` já depende dele).

### Gatilho de revisão

Se a exceção de D7 for aceita, esta ADR é revisada quando o
`openapi-typescript` declarar suporte a TypeScript 6 (ou quando o
workspace mudar de major de TypeScript), removendo a exceção.

## Consequências

**Positivas**:

- Contrato, tipos e cliente rastreáveis a uma única fonte (DTOs), com
  geração determinística comprovada byte a byte e drift detectado em
  `yarn validate` sem mutar o repositório.
- `libs/api-client` autocontido (sem aresta Nx para a API), pronto para
  o consumo futuro pelo `apps/web`.
- Decisões que dependem de evidência ficam explicitamente condicionadas,
  em vez de assumidas.

**Negativas / trade-offs aceitos**:

- `contract:check` sem cache deixa `yarn validate` mais lento; cache só
  seria proposto com todos os inputs listados e prova negativa de
  invalidação. Como o gerador roda sobre o `dist` compilado, os alvos de
  contrato da API dependem de `build` (e de `db:generate`).
- Se a exceção de peer de D7 for aceita, um warning permanente de peer
  fica registrado como risco até o gatilho de revisão.
- O grafo de workspaces copiado pelos Dockerfiles passa a cinco entradas
  (duplicado nos dois Dockerfiles).
- Entre as subtarefas 5.2 e 5.3 as imagens ficaram quebradas (resolvido
  na 5.3); por isso as duas devem ser entregues no mesmo commit.

## Fora de escopo

- Hooks do TanStack Query gerados automaticamente (ver ADR 001).
- Autenticação do cliente, `apps/web`, e qualquer endpoint novo.
- Alterar o `tsconfig.json` raiz (lacuna histórica de `worker`/`queue`):
  não é necessária à Fase 5; só será tocada se a fase demonstrar a
  necessidade.
- Trocar de ferramenta de geração, usar override de peer ou rebaixar o
  TypeScript: exigiriam nova decisão do responsável (e, se for o caso,
  ADR própria).

## Divergências registradas na abertura

- A ADR 001 e a seção 6 de `TARGET_ARCHITECTURE.md` chamam de "cliente
  gerado" o que são tipos gerados (hooks não são gerados); esta ADR
  interpreta "cliente gerado" no `contract:check` como "tipos gerados".
- O local do `openapi.json` não estava fixado em nenhum documento
  anterior (resolvido por D1, `Proposed`).
- A descrição de `yarn validate` na seção 13 de `TARGET_ARCHITECTURE.md`
  não lista `contract:check`; a atualização fica para o fechamento da
  Fase 5.
