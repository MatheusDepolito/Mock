# ADR 005 — Runtime da API: Express, Pino e `libs/config` server-only

## Status

Accepted

## Contexto

A Fase 2 implementa o skeleton técnico da API NestJS
([docs/IMPLEMENTATION_ROADMAP.md](../IMPLEMENTATION_ROADMAP.md)). Três
decisões de runtime precisavam ser fixadas antes da implementação, para
evitar ambiguidade em fases futuras que dependem delas (worker,
Dockerfiles, observabilidade):

1. Qual adaptador HTTP o NestJS usa (Express ou Fastify).
2. Qual logger estruturado a API usa.
3. Como e quando `libs/config` é criada, dado que
   [docs/TARGET_ARCHITECTURE.md](../TARGET_ARCHITECTURE.md) (seção 9)
   já define que ela terá entrypoints `server-only` e `client-safe`
   separados, mas `apps/web` (que consumiria o entrypoint client-safe)
   só existe a partir da Fase 7.

Também era necessário fixar a versão do NestJS compatível com o
gerador `@nx/nest@23.2.0`, cujo `peerDependencies` declara
`@nestjs/core` e `@nestjs/common` como `>=10.0.0 <12.0.0` — ou seja,
não suporta NestJS 12.

## Decisão

- **Adaptador HTTP**: Express (`@nestjs/platform-express`). Fastify não
  é adotado nesta fase nem substitui Express sem uma nova ADR.
- **Logger**: Pino, integrado via `nestjs-pino`, como logger oficial do
  Nest (`app.useLogger`) e como logger HTTP (`pino-http`), com
  redação automática dos campos `authorization`, `cookie` e
  `set-cookie`.
- **Versão do NestJS**: `11.2.3` em todos os pacotes `@nestjs/*`,
  porque `@nx/nest@23.2.0` não suporta NestJS 12
  (`peerDependencies: "@nestjs/core": ">=10.0.0 <12.0.0"`). Todas as
  dependências de runtime da API são fixadas em versão exata (sem `^`
  ou `~`).
- **`libs/config`**: criada nesta fase como pacote Nx package-based
  (`@mockp/config`, sem `project.json`), expondo **somente** o
  entrypoint server-only (`@mockp/config/server`), consumido por
  `apps/api`. O entrypoint client-safe (`@mockp/config/client`) não é
  criado agora — só passa a existir na Fase 7, quando `apps/web` for
  criado e precisar consumir configuração client-safe. Criar o
  entrypoint client-safe antes de existir um consumidor seria
  antecipação de escopo sem validação real.
- Validação de ambiente do entrypoint server-only feita com Zod,
  cobrindo `NODE_ENV`, `PORT`, `HOST`, `LOG_LEVEL`,
  `CORS_ALLOWED_ORIGINS`, `RATE_LIMIT_TTL_MS` e `RATE_LIMIT_LIMIT`.
  Configuração inválida impede o bootstrap da aplicação com mensagem
  clara, em vez de a aplicação subir em estado inconsistente.

## Consequências

**Positivas**:

- Express é o adaptador HTTP mais maduro e compatível com o ecossistema
  NestJS (middlewares, Swagger, `nestjs-pino`), reduzindo risco de
  incompatibilidade nesta fase inicial.
- Pino oferece logging estruturado de baixo overhead, com integração
  direta ao ciclo de vida HTTP via `pino-http`, satisfazendo a exigência
  de logging estruturado e redação de dados sensíveis de
  [docs/TARGET_ARCHITECTURE.md](../TARGET_ARCHITECTURE.md) (seção 4).
- Fixar NestJS `11.2.3` evita instalar uma versão incompatível com o
  gerador Nx disponível, prevenindo falhas de scaffold silenciosas.
- Criar `libs/config` apenas com o entrypoint necessário agora evita
  código morto (entrypoint client-safe sem consumidor) até a Fase 7.

**Negativas / trade-offs aceitos**:

- Trocar para Fastify no futuro (caso necessário por performance)
  exigiria revisão de middlewares e desta ADR.
- `libs/config` precisará de uma segunda rodada de implementação na
  Fase 7 para o entrypoint client-safe — aceito como consequência
  direta de não antecipar escopo sem consumidor.

## Fora de escopo

- Entrypoint client-safe de `libs/config` (Fase 7).
- Qualquer configuração de logging específica de worker (Fase 4) além
  do padrão aqui definido para a API.
- Troca de Express por Fastify.
- Versão do NestJS além de `11.2.3` nesta fase — upgrade para NestJS 12
  (quando `@nx/nest` suportar) exigiria nova ADR ou revisão desta.
