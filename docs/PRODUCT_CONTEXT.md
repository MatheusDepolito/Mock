# Contexto do produto

## Visão geral

Mockp é uma plataforma imobiliária para conectar clientes, corretores e
corretoras. O objetivo do produto é intermediar a jornada entre a busca
por imóveis e a relação comercial com quem os representa, oferecendo
ferramentas tanto para quem procura um imóvel quanto para quem o anuncia
e gerencia comercialmente.

Este documento descreve o produto de forma completa (incluindo
capacidades futuras), mas deixa explícito, em cada seção, o que pertence
ao estado inicial (skeleton) e o que é visão de produto a ser construída
em etapas posteriores.

## Personas

- **customer** — pessoa que busca, avalia e manifesta interesse em
  imóveis.
- **agent** — corretor(a) individual responsável por anunciar e
  atender imóveis.
- **manager** — responsável pela gestão de uma corretora (`Brokerage`),
  incluindo seus corretores e imóveis.
- **admin** — responsável pela operação e governança da plataforma como
  um todo.

Uma mesma conta (`User`) pode acumular mais de um papel simultaneamente
(por exemplo, um `agent` que também é `customer` em outra transação).
Papéis são cumulativos, não mutuamente exclusivos. Ver
[ADR 004](adr/004-auth-ownership.md) para o modelo de autorização
correspondente.

## Jornadas futuras (visão de produto)

As jornadas abaixo representam a visão completa do produto. **Nenhuma
delas é implementada no skeleton inicial.**

- **Autenticação com credenciais e Google** — login por e-mail/senha e
  via Google OAuth, com sessão gerida pelo frontend e tokens emitidos
  pela API. Ver [ADR 004](adr/004-auth-ownership.md).
- **Cadastro e gestão de corretoras e corretores** — criação de
  `Brokerage`, vínculo de `agent` a uma ou mais corretoras via
  `BrokerageMembership`, e gestão de equipe pelo `manager`.
- **Cadastro e busca geoespacial de imóveis** — publicação de `Property`
  com `Address` geolocalizado e busca por proximidade/região usando
  PostGIS.
- **Manifestações de interesse e acompanhamento comercial** — clientes
  registram interesse em um imóvel e corretores/corretoras acompanham o
  funil comercial resultante (inquiries, timelines, reviews).
- **Mapas e localização** — visualização de imóveis em mapa
  interativo (Mapbox), com camadas de busca e clusterização.
- **Pagamentos com Stripe** — cobrança de serviços da plataforma
  (planos, destaques de anúncio, ou outras transações comerciais a
  definir).
- **Tarefas assíncronas com BullMQ** — processamento em background de
  operações de negócio (notificações, geração de relatórios,
  integrações externas), além dos jobs técnicos do skeleton.

> **Nota sobre Stripe e Mapbox no skeleton**: diferente das demais
> jornadas desta lista, o skeleton inicial já inclui adapters técnicos
> funcionais para Stripe e Mapbox, validados contra ambientes de teste
> (sandbox). Isso não antecipa a jornada de negócio (checkout, pagamento,
> mapa de imóveis) — apenas confirma que a integração técnica está
> correta. Ver seção "Estado inicial" abaixo e
> [docs/TARGET_ARCHITECTURE.md](TARGET_ARCHITECTURE.md).

## Estado inicial (skeleton técnico)

A primeira entrega do projeto **não implementa nenhuma das jornadas de
negócio acima**. Ela estabelece somente a fundação técnica operacional:
monorepo configurado, API e web funcionando de ponta a ponta com um
fluxo trivial (health check), banco de dados com o núcleo de entidades
revisado (sem funcionalidades de negócio sobre elas), fila processando
um job técnico (`system.ping`), as quatro áreas de persona existindo
como layouts vazios no frontend, e adapters de Stripe e Mapbox
validados por smoke tests contra ambientes de teste (sandbox), sem
nenhuma jornada comercial ou de mapa construída sobre eles.

O detalhamento de critérios de aceite do skeleton está em
[docs/IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md). O modelo de
dados inicial está descrito em
[docs/TARGET_ARCHITECTURE.md](TARGET_ARCHITECTURE.md).

## Fora de escopo do skeleton (explícito)

- Nenhum endpoint de autenticação funcional (login, refresh, logout,
  Google OAuth) é criado nesta etapa — apenas a decisão é documentada
  ([ADR 004](adr/004-auth-ownership.md)).
- Inquiries, timelines, reviews, verificações de corretor/corretora e
  pagamentos de negócio não fazem parte do modelo de dados inicial.
- Busca geoespacial funcional de negócio, mapa de imóveis e qualquer
  jornada de usuário envolvendo Mapbox não são implementados no
  skeleton, apesar de PostGIS já estar provisionado e de existir um
  adapter técnico de Mapbox validado em sandbox.
- Checkout, cobrança e qualquer jornada comercial envolvendo Stripe não
  são implementados no skeleton, apesar de existir um adapter técnico
  de Stripe validado somente em modo de teste (test mode).
