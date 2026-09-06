# ADR 004 — Autoridade de autenticação: API emite tokens, Auth.js mantém sessão

## Status

Accepted

## Contexto

O Mockp precisará suportar login por credenciais e por Google OAuth,
com quatro papéis cumulativos por usuário (`customer`, `agent`,
`manager`, `admin`) e autorização tanto por papel quanto por posse do
recurso (ex.: um `agent` só edita os próprios imóveis, um `manager` só
gerencia a própria corretora). Era necessário decidir, antecipadamente,
qual sistema é a autoridade de identidade e tokens — a API (NestJS) ou o
frontend (Next.js via Auth.js) — para evitar ambiguidade quando a
implementação funcional for iniciada.

Esta ADR registra a decisão arquitetural. **Nenhum endpoint de
autenticação é implementado no skeleton inicial** (ver
[docs/IMPLEMENTATION_ROADMAP.md](../IMPLEMENTATION_ROADMAP.md)).

## Decisão

- A **API é a autoridade final** sobre emissão, validação e revogação de
  tokens da aplicação.
- **Access token**: JWT de curta duração, emitido pela API.
- **Refresh token**: rotativo (um novo refresh token é emitido a cada
  uso), revogável, armazenado **em hash** no banco (nunca em texto
  plano).
- **Auth.js** mantém a sessão do lado do Next.js (frontend), mas não é a
  autoridade de identidade da aplicação.
- Para login com Google, **Auth.js conduz o fluxo OAuth** até obter o
  ID token do Google.
- A **API valida o ID token do Google** recebido do frontend e, a
  partir dele, emite seus próprios access/refresh tokens — o Google
  nunca emite os tokens usados pela aplicação Mockp.
- **Papéis (`Role`) são cumulativos** por usuário (`UserRole` como
  tabela associativa).
- **Autorização por papel** ocorre no guard (nível de rota/endpoint),
  verificando se o usuário possui o papel exigido.
- **Autorização por recurso** ocorre no Service, verificando posse ou
  relação específica com a entidade acessada (ex.: propriedade de um
  `Property`, associação a uma `Brokerage`).

## Consequências

**Positivas**:

- Um único ponto de autoridade (API) sobre tokens simplifica auditoria,
  revogação e futura adição de outros clientes (ex.: app mobile) sem
  depender de Auth.js.
- Refresh rotativo com armazenamento em hash reduz o impacto de
  vazamento de um refresh token específico.
- Separar autorização por papel (guard) de autorização por recurso
  (service) evita guards excessivamente complexos e mantém a regra de
  posse junto da regra de negócio correspondente.
- Delegar a Auth.js apenas a condução do OAuth do Google (não a emissão
  de tokens da aplicação) evita acoplar a sessão da aplicação a um
  provedor de sessão específico do Next.js.

**Negativas / trade-offs aceitos**:

- Duas camadas de sessão coexistem conceitualmente (sessão do Auth.js
  no Next.js e tokens da API) — complexidade aceita em troca de manter a
  API como autoridade única de identidade, inclusive para futuros
  clientes não-web.
- Rotação de refresh token exige que o frontend trate corretamente a
  substituição do token a cada renovação, sob risco de invalidar sessão
  em caso de implementação incorreta.

## Fora de escopo

- Implementação de qualquer endpoint de autenticação (login, refresh,
  logout, callback do Google) — não faz parte do skeleton inicial.
- Definição de política de expiração exata (tempo de vida de access e
  refresh tokens) — a ser definida quando a implementação funcional for
  planejada.
- Autenticação multifator, recuperação de senha e verificação de e-mail
  não são tratadas nesta ADR.
- Modelo de permissões granulares além de papel + posse de recurso (ex.:
  ACLs específicas) não é considerado nesta decisão.
