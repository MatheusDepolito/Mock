# ADR 001 — REST com OpenAPI/Swagger como contrato, sem GraphQL

## Status

Accepted

## Contexto

O Mockp precisa de um contrato de API estável entre o backend (NestJS)
e o frontend (Next.js), consumido também por um cliente HTTP tipado. O
projeto de referência anterior utilizava GraphQL/Apollo (ver
[docs/REFERENCE_REPOSITORY.md](../REFERENCE_REPOSITORY.md)). Era
necessário decidir se essa abordagem seria mantida ou substituída para
o Mockp.

Fatores considerados:

- Simplicidade operacional para um monólito modular com um único
  frontend.
- Facilidade de gerar tipos e clientes de forma determinística.
- Necessidade de documentação de API navegável (Swagger UI) para
  desenvolvimento e integração.
- Redução de superfície de complexidade (resolvers, schema stitching,
  cache normalizado do Apollo) desnecessária para o escopo atual do
  produto.

## Decisão

O Mockp usará **exclusivamente REST** como estilo de API, com
**OpenAPI/Swagger** como fonte de verdade do contrato:

- NestJS expõe controllers REST versionados (`/api/v1/...`).
- O Swagger é gerado a partir dos DTOs e decorators dos controllers
  (código como fonte de verdade do contrato, não um schema mantido em
  paralelo).
- O `openapi.json` é gerado de forma determinística e versionado no
  repositório.
- Tipos TypeScript são gerados a partir do `openapi.json` via
  `openapi-typescript`, consumidos por `openapi-fetch` em
  `libs/api-client`.
- GraphQL e Apollo não são adotados neste projeto.

## Consequências

**Positivas**:

- Um único formato de contrato, mais simples de versionar e de detectar
  drift em CI.
- Documentação interativa (Swagger UI) gerada automaticamente.
- Cliente tipado gerado deterministicamente, sem necessidade de
  resolvers ou schema GraphQL paralelo.

**Negativas / trade-offs aceitos**:

- Endpoints REST podem exigir mais de uma chamada para compor dados que
  um único query GraphQL resolveria em uma única viagem — aceito como
  trade-off razoável dado o escopo de um único frontend controlado pelo
  próprio time.
- Evolução de contrato exige disciplina de versionamento (`/v1`, `/v2`)
  em vez de flexibilidade de schema do GraphQL.

## Fora de escopo

- Introdução de GraphQL como camada adicional sobre o REST (ex.: BFF
  GraphQL) não é considerada nesta decisão e exigiria uma nova ADR.
- Geração automática de hooks TanStack Query a partir do contrato não é
  adotada — hooks são escritos manualmente por feature (ver
  [docs/TARGET_ARCHITECTURE.md](../TARGET_ARCHITECTURE.md), seção 6).
