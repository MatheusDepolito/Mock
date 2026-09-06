# ADR 002 — Camadas do backend: Controller → Service → Repository → Prisma

## Status

Accepted

## Contexto

O backend NestJS precisa de uma organização interna clara por domínio,
que evite acoplamento direto ao ORM em pontos indevidos do código e que
mantenha o contrato público da API independente do schema de banco de
dados. O projeto de referência anterior permitia acesso direto ao Prisma
fora de uma camada dedicada (ver
[docs/REFERENCE_REPOSITORY.md](../REFERENCE_REPOSITORY.md)), o que
dificultava testes, trocas de estratégia de persistência e controle de
autorização.

## Decisão

O backend será organizado por domínio, com fluxo de requisição fixo:

```
HTTP -> Controller -> Service -> Repository -> Prisma -> PostgreSQL
```

Responsabilidades por camada:

- **Controller**: transporte HTTP, DTOs, documentação Swagger, códigos
  de status e delegação ao Service.
- **Service**: regras de negócio, autorização por recurso, orquestração
  entre repositories e adapters externos.
- **Repository**: acesso ao Prisma, construção de queries, seleção de
  campos, persistência e transações.
- **DTOs**: contrato público, independente dos modelos Prisma.
- **Module**: composição do domínio.

Restrições obrigatórias:

- Controller não acessa Repository ou Prisma diretamente.
- Service não acessa Prisma diretamente.
- Repository não contém regra de negócio.
- Repository é orientado a agregado (uma entidade raiz e suas
  dependentes diretas), nunca um repository por tabela Prisma;
  operações atômicas sobre tabelas do mesmo agregado pertencem ao
  repository desse agregado.
- Não criar repository genérico reutilizável entre domínios.
- Não criar interfaces de repository enquanto existir apenas a
  implementação Prisma.
- Não retornar modelos Prisma diretamente nas respostas da API.
- Não expor hashes, tokens ou campos internos em nenhuma resposta.
- Integrações externas ficam isoladas em adapters próprios, nunca
  chamadas diretamente do Service sem essa indireção.

## Consequências

**Positivas**:

- Separação clara de responsabilidades, facilitando testes unitários de
  Service com Repository mockado.
- Contrato público (DTOs) protegido de mudanças no schema do banco.
- Autorização por recurso concentrada no Service, evitando duplicação
  de regra de negócio entre camadas.
- Menor acoplamento ao Prisma especificamente, sem pagar o custo de uma
  abstração de repositório genérica que hoje não tem segundo caso de
  uso.

**Negativas / trade-offs aceitos**:

- Mais arquivos e indireção por domínio em comparação a acessar o
  Prisma diretamente no Service ou Controller.
- Sem interface de repository, uma futura troca de ORM exigiria reescrever
  as implementações concretas (aceito: introduzir a interface antes de
  haver uma segunda implementação real seria abstração especulativa).

## Fora de escopo

- Definição de uma camada de "use cases" ou CQRS explícito — não é
  adotada nesta ADR; Service concentra regra de negócio e orquestração.
- Estratégia de cache de leitura entre Repository e Prisma não é
  definida aqui.
- Introdução de interfaces de repository quando surgir uma segunda
  implementação de persistência real exigirá revisão desta ADR, não
  criação antecipada.
