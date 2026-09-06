# Repositório de referência

## Localização

- **Repositório antigo (referência)**: `C:\dev\mockp\Mockp`
- **Repositório novo (este projeto)**: `C:\dev\mockp_v1`

O caminho acima é o caminho local nesta máquina. Em outras máquinas ou
para outros desenvolvedores, o caminho local pode variar — o que importa
é a identidade do repositório (histórico e conteúdo), não o caminho
absoluto. Nenhum script, configuração ou dependência deste projeto deve
assumir esse caminho como fixo.

## Propósito deste documento

O repositório antigo (`C:\dev\mockp\Mockp`) foi identificado e é tratado
como **referência somente de leitura** de produto e de arquitetura. Ele
não é clonado, não é submódulo, não é dependência e não é importado por
nenhuma ferramenta deste projeto — é consultado manualmente por quem
estiver implementando uma tarefa, quando útil.

## Regra geral

O repositório antigo **não é dependência, não é fonte de importação
automatizada de código e não é autoridade arquitetural**. Toda decisão
arquitetural do Mockp está registrada em
[docs/TARGET_ARCHITECTURE.md](TARGET_ARCHITECTURE.md) e nas ADRs de
[docs/adr/](adr/); o repositório antigo nunca substitui essas fontes,
mesmo quando o padrão nele observado parecer razoável.

## Regra de reaproveitamento de código

Não copie código do repositório antigo cegamente. Antes de trazer
qualquer trecho, comportamento ou padrão dele para o Mockp, siga esta
sequência:

1. **Identificar o comportamento ou padrão útil** — o que exatamente o
   código antigo resolve, e por quê (não apenas "como" ele resolve).
2. **Remover dependências GraphQL/Apollo** — qualquer código vindo do
   repositório antigo que dependa de resolvers, SDL ou clientes Apollo
   deve ser reescrito para o modelo REST/OpenAPI do Mockp (ver
   [ADR 001](adr/001-rest-openapi.md)) antes de ser considerado.
3. **Adequar o código à arquitetura nova** — respeitar as camadas
   Controller → Service → Repository → Prisma (ver
   [ADR 002](adr/002-backend-layers.md)) e a organização Atomic Design +
   feature-first do frontend (ver
   [ADR 003](adr/003-frontend-organization.md)); nenhum código é
   transportado no formato original.
4. **Adicionar testes** — código reaproveitado não herda cobertura de
   teste do repositório antigo; a cobertura exigida pela stack de testes
   do Mockp (ver [docs/TARGET_ARCHITECTURE.md](TARGET_ARCHITECTURE.md))
   deve ser criada junto com a adequação.
5. **Registrar a referência utilizada** — o resumo da tarefa que
   reaproveitar algo do repositório antigo deve indicar qual arquivo ou
   módulo de `C:\dev\mockp\Mockp` serviu de referência, para
   rastreabilidade.

## Padrões úteis observados no repositório antigo

Os itens abaixo são padrões ou decisões do repositório antigo
considerados úteis como referência conceitual, sujeitos à adequação
descrita acima antes de qualquer reaproveitamento:

- Yarn workspaces e Nx como conceito de organização de monorepo.
- NestJS organizado por domínio (módulos por área de negócio).
- `PrismaService` centralizado como ponto único de acesso ao client
  Prisma.
- Autenticação com credenciais, Google, JWT e papéis.
- Autorização por papel e por recurso.
- Atomic Design com `atoms`, `molecules`, `organisms` e `templates`.
- Tailwind compartilhado por um pacote de UI comum.
- React Hook Form, Zod e adapters de formulário.
- Mapbox e Stripe como integrações já existentes no produto anterior.
- Separação de libs por responsabilidade: UI, formulários, rede e
  utilitários.

## Padrões que não devem ser transportados

Os itens abaixo são explicitamente rejeitados para o Mockp, mesmo
existindo no repositório antigo:

- GraphQL, Apollo, resolvers, SDL e codegen GraphQL — ver
  [ADR 001](adr/001-rest-openapi.md).
- Services localizados dentro de pastas `graphql` (acoplamento entre
  regra de negócio e camada de transporte GraphQL).
- Quatro aplicações Next.js separadas por persona — ver
  [ADR 003](adr/003-frontend-organization.md).
- Controllers acessando o Prisma diretamente, sem passar pela camada
  Repository — ver [ADR 002](adr/002-backend-layers.md).
- Componentes genéricos de UI misturados com requests e regras de
  domínio.
- Imports profundos entre packages (acessar arquivos internos de outro
  package em vez de seu ponto de entrada público).
- MUI e Emotion coexistindo com Tailwind CSS.
- DTOs REST incompletos tratados como contrato confiável (contrato deve
  vir de DTOs completos e do OpenAPI gerado, conforme
  [docs/TARGET_ARCHITECTURE.md](TARGET_ARCHITECTURE.md), seção 6).
- Qualquer dependência de microservices, Elasticsearch (no MVP), caso
  tenham sido usados no repositório antigo — nenhuma dessas tecnologias
  faz parte da stack do Mockp.

## Como usar este documento na prática

- Ao investigar como uma funcionalidade era resolvida no repositório
  antigo, trate isso como **insumo de discussão de produto e
  arquitetura**, nunca como especificação técnica pronta para uso.
- Aplique sempre a sequência da seção "Regra de reaproveitamento de
  código" antes de transportar qualquer comportamento.
- Se um padrão do repositório antigo não estiver coberto pelas listas
  acima e parecer necessário para o Mockp, ele deve passar pelo processo
  de ADR antes de ser adotado (ver [AGENTS.md](../AGENTS.md), seção 2).
