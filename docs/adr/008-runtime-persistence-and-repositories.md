# ADR 008 — Integração runtime da persistência: `PrismaModule`, `RedisModule` e repositories por agregado

## Status

Accepted

## Contexto

A Tarefa 3.2 ([ADR 006](006-persistence-and-local-infrastructure.md),
[ADR 007](007-multi-tenant-workspace-foundation.md)) deixou `schema.prisma`,
a migration inicial e o seed prontos e validados — inclusive em banco
limpo — mas **nenhum código da API acessa o banco ou o Redis ainda**.
`ServerConfig.databaseUrl`/`redisUrl` existem e são validados desde a
Fase 3 (ver `libs/config/src/server/schema.ts`), mas não são consumidos
por nenhum client. A Tarefa 3.3 ([docs/IMPLEMENTATION_ROADMAP.md](../IMPLEMENTATION_ROADMAP.md),
Fase 3) está autorizada a começar e cobre exatamente essa lacuna:
`PrismaModule`/`PrismaService`, módulo e provider de Redis, e
repositories por agregado (`UserRepository`, `WorkspaceRepository`,
`PropertyRepository`), conforme [ADR 002](002-backend-layers.md)
(camadas do backend) e a seção 10 de
[docs/TARGET_ARCHITECTURE.md](../TARGET_ARCHITECTURE.md) (agregados do
núcleo).

Esta ADR **fechou o desenho completo antes de qualquer linha de código
da Tarefa 3.3** — mesma disciplina já usada pelas ADRs 006 e 007
(AGENTS.md §2) — e foi **`Accepted`** pelo responsável pelo projeto após
três rodadas de revisão documental (ver "Histórico de revisões"
abaixo), substituindo pontualmente a decisão operacional de geração de
UUID em inserções raw de `Address` da ADR 006 (§0, item 5). Ela
**não implementou nada por si só**: nenhum arquivo de código,
dependência, Docker, banco, migration, seed ou teste foi criado/alterado
por esta ADR — a implementação da Tarefa 3.3 é autorizada subtarefa por
subtarefa, a partir daqui, cada uma com sua própria autorização
explícita (ver [docs/IMPLEMENTATION_ROADMAP.md](../IMPLEMENTATION_ROADMAP.md)
para o status corrente de cada subtarefa). As Tarefas 3.4 a 3.6
continuam bloqueadas.

**Histórico de revisões**: a primeira revisão fechou tipos de comando/
resultado, catálogo de erros, concorrência e testes; a segunda corrigiu
a estratégia de composição de módulos (substituindo módulos-fábrica por
um `RuntimeConfigModule` global + módulos estáticos comuns), o
lifecycle do `RedisService`, a atomicidade das criações de `Workspace`,
os resultados dos agregados, a validação de `roleNames` e a precisão da
tradução de erros; a terceira fechou a hierarquia de erros
(`PersistenceError` com construtor público), a atomicidade de
`updatePropertyStatus`, a corrida residual de `AgentProfile`, e um
último microajuste em `RedisService.ping()` para nunca propagar um erro
bruto do `ioredis` diretamente (ver §3). Cada revisão alterou somente
`docs/adr/008-...md`, `AGENTS.md`, `README.md`,
`docs/IMPLEMENTATION_ROADMAP.md` e `docs/TARGET_ARCHITECTURE.md`.

### Investigação do estado atual (sem alterar nada)

- **`AppModule.forRoot(serverConfig, options)`** ([app.module.ts](../../apps/api/src/app/app.module.ts))
  já é um **dynamic module**, recebendo `ServerConfig` como parâmetro
  explícito (nunca relido de `process.env` dentro do module graph).
  `SERVER_CONFIG` é hoje um `Symbol` declarado, provido e exportado
  **dentro do próprio `app.module.ts`**, sem nenhum outro módulo o
  injetando ainda — esta ADR move essa declaração para um arquivo
  compartilhado (ver §2.1) para que `PrismaService`/`RedisService`
  possam injetá-lo sem importar `app.module.ts`.
- **`main.ts`** já chama `app.enableShutdownHooks()` antes de
  `app.listen(...)` — qualquer provider que implemente
  `OnModuleDestroy` já tem seu hook acionado automaticamente no
  shutdown; nenhuma mudança em `main.ts` é necessária.
- **`create-test-app.ts`** define `TEST_SERVER_CONFIG` com
  `databaseUrl`/`redisUrl` sintaticamente válidos, mas **"never
  dialed"** — os 34 testes de integração offline atuais
  (`api:test:integration`, parte de `yarn validate`) sobem a aplicação
  inteira sem nenhum PostgreSQL/Redis alcançável. **Este continua sendo
  o risco central que esta ADR neutraliza estruturalmente**: conexão
  sempre preguiçosa, nunca ansiosa.
- **`HealthService`** ainda não verifica nenhuma dependência externa —
  essa mudança pertence à **Tarefa 3.4** (readiness real), que continua
  responsável **somente** por isso e por seus testes HTTP.
- **`apps/api/package.json`** já declara `prisma`, `@prisma/client`,
  `@prisma/adapter-pg`, `pg`. **Não existe `ioredis`** ainda. Não
  existe target `test:integration:infra`, nem script raiz
  `validate:infra`.
- **`docker-compose.yml`** já expõe `postgres`/`redis` em
  `127.0.0.1:5432`/`127.0.0.1:6379` (profile padrão).
- **`apps/api/src`** hoje só tem `app/`, `common/`, `health/` e
  `generated/prisma-client/` — nenhuma pasta de domínio existe ainda.
- **`REFERENCE_REPOSITORY.md`** já lista `PrismaService` centralizado
  como padrão útil observado no repositório antigo.

## Decisão

### 0. Decisões já aprovadas (recapitulação cumulativa)

Fixadas nas revisões anteriores, incorporadas em todas as seções
abaixo, sem reabertura:

1. Nomes `users`/`workspaces`/`properties`
   (`UsersModule`/`WorkspacesModule`/`PropertiesModule`) — aprovados.
2. Antecipação de `api:test:integration:infra`/`yarn validate:infra` da
   Tarefa 3.4 para a Tarefa 3.3 — aprovada.
3. A Tarefa 3.4 continua responsável **somente** pelo readiness real e
   seus testes HTTP.
4. `RETURNING` no `INSERT` raw de `Address`, omitindo `id` (default
   nativo `uuidv7()` da coluna) — aprovado.
5. **Aceita esta ADR**, ela substitui **exclusivamente** a decisão
   operacional de geração de UUID em inserções raw de `Address` da
   ADR 006 (seção "SQL geoespacial... geração de UUID em inserções
   raw") — nenhuma outra decisão da ADR 006 muda, exceto o marco
   temporal do item 2 acima.
6. **Esta ADR está `Accepted`** — todas as decisões técnicas descritas
   nas seções abaixo (composição de módulos, lifecycle do Redis,
   repositories e contratos, CAS e locks, catálogo de erros,
   antecipação de `validate:infra`, as oito subtarefas) foram aprovadas
   explicitamente pelo responsável pelo projeto. A implementação da
   Tarefa 3.3 segue autorizada **subtarefa por subtarefa** (§8) — a
   aceitação desta ADR autoriza o planejamento, não a execução de todas
   as subtarefas de uma vez.

### 1. Tipos de comando e resultado (fronteira Repository → chamador)

Nenhum método de repository recebe um `input`/retorna um tipo genérico,
e nenhum tipo gerado pelo Prisma (model ou enum) atravessa a fronteira
do repository. Cada agregado define seus próprios **tipos de comando**
(entrada) e **tipos de resultado/projeção** (saída) — **não são DTOs
HTTP**. Enums Prisma reaproveitados (`PropertyStatus`, `WorkspaceType`,
`RoleName` etc.) ganham uma união de literais própria, equivalente por
valor, nunca importada do client gerado.

Localização: `apps/api/src/users/user.types.ts`,
`apps/api/src/workspaces/workspace.types.ts`,
`apps/api/src/properties/property.types.ts`.

#### `apps/api/src/users/user.types.ts`

```ts
export type RoleName = 'CUSTOMER' | 'ADMIN';
export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';

export interface CreateUserWithCredentialCommand {
  /** Já trimado pelo chamador — ver "Normalização" em §4.1. Nunca lower-cased pelo Repository; `citext` compara sem diferenciar caixa no banco. */
  email: string;
  /** Já hasheado (bcrypt/argon2) pelo chamador — o Repository nunca hasheia nem vê a senha em texto plano. */
  passwordHash: string;
  /** Nomes do catálogo global, nunca IDs — validado pelo Repository antes de qualquer query, ver §4.1 "Papéis iniciais". */
  roleNames: readonly RoleName[];
}

export interface CreateUserWithAuthIdentityCommand {
  email: string;
  /** String livre do provedor OAuth (ex.: 'google') — mesma decisão da ADR 006. */
  provider: string;
  providerAccountId: string;
  roleNames: readonly RoleName[];
}

export interface UserAggregateResult {
  id: string;
  email: string;
  status: UserStatus;
  /** Concorrência otimista (ADR 007) — exposto mesmo sem update method nesta tarefa, para uso futuro sem quebrar o Result. */
  version: number;
  deactivatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  // Nunca inclui passwordHash, tokens ou qualquer campo de Credential/AuthIdentity —
  // mesma disciplina de "nunca expor hashes/tokens" já fechada pela ADR 002.
}
```

#### `apps/api/src/workspaces/workspace.types.ts`

```ts
export type WorkspaceType = 'INDIVIDUAL' | 'BROKERAGE';
export type WorkspaceStatus = 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';

export interface CreateIndividualWorkspaceCommand {
  /** Verificado dentro da transação — ver §4.2. */
  ownerUserId: string;
  /** Nome de exibição/comercial (ADR 007, "Nomes"). Já trimado pelo chamador. */
  name: string;
  /** Slug de URL, já trimado; `citext` garante unicidade case-insensitive no banco. */
  slug: string;
}

export interface CreateBrokerageWorkspaceCommand {
  ownerUserId: string;
  name: string;
  slug: string;
  /** Razão social — vira Brokerage.legalName. */
  brokerageLegalName: string;
  /** Quando true, exige AgentProfile existente para ownerUserId e o Repository cria também AGENT + WorkspaceAgent ACTIVE — ver §4.2. */
  ownerActsAsAgent: boolean;
}

export interface WorkspaceRecord {
  id: string;
  type: WorkspaceType;
  name: string;
  slug: string;
  ownerUserId: string;
  status: WorkspaceStatus;
  version: number;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
```

#### `apps/api/src/properties/property.types.ts`

```ts
export type PropertyStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export interface CreateAddressInput {
  addressLine1: string;
  addressLine2?: string;
  district?: string;
  /** ISO 3166-1 alpha-2, maiúsculo — validado pelo Repository antes de escrever, ver §7.4. */
  countryCode: string;
  regionCode: string;
  locality: string;
  postalCode: string;
  latitude: number;
  longitude: number;
}

export interface CreatePropertyCommand {
  workspaceId: string;
  /** Deve resolver a um WorkspaceAgent ACTIVE **neste** workspace — ver §4.3/§6. */
  responsibleAgentUserId: string;
  title: string;
  /** Decimal exato como string (ex.: "250000.50") — nunca number/float (ADR 006). Conversão para o Decimal-compatível do Prisma nunca vaza para fora do Repository. */
  price: string;
  /** ISO 4217, 3 letras maiúsculas — validado antes de escrever, ver §7.4. */
  currency: string;
  address: CreateAddressInput;
}

export interface UpdatePropertyStatusCommand {
  workspaceId: string;
  propertyId: string;
  /** CAS — ver §6. */
  expectedVersion: number;
  status: PropertyStatus;
}

export interface AddressRecord {
  id: string;
  addressLine1: string;
  addressLine2: string | null;
  district: string | null;
  countryCode: string;
  regionCode: string;
  locality: string;
  postalCode: string;
  latitude: number;
  longitude: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PropertyWithAddressResult {
  id: string;
  workspaceId: string;
  responsibleAgentUserId: string;
  title: string;
  price: string;
  currency: string;
  status: PropertyStatus;
  publishedAt: Date | null;
  archivedAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  /**
   * Sempre presente no tipo — nunca `| null` (o caminho normal de
   * escrita, `createProperty`, sempre cria Property+Address juntos, na
   * mesma transação). O schema não consegue garantir "exatamente um
   * Address por Property" sozinho (só "no máximo um", via
   * `addresses.property_id` único) — ver §4.3 para o que o Repository
   * faz se um Property existente for encontrado sem Address (nunca
   * retorna um objeto com `address` ausente; lança
   * `PersistenceInvariantError('PROPERTY_ADDRESS_MISSING')`).
   */
  address: AddressRecord;
}
```

### 2. Composição de módulos e injeção de dependência

Substitui integralmente a estratégia de módulos-fábrica
(`createUsersModule(prismaModule)` etc.) da revisão anterior — removida
por completo, junto com o compartilhamento de `DynamicModule` por
referência, a criação de módulos de domínio vazios, e qualquer decisão
adiada para a implementação.

#### 2.1 `RuntimeConfigModule` — único módulo global

```ts
// apps/api/src/common/server-config.token.ts
export const SERVER_CONFIG = Symbol('SERVER_CONFIG');
```

```ts
// apps/api/src/common/runtime-config.module.ts
@Module({})
export class RuntimeConfigModule {
  static forRoot(config: ServerConfig): DynamicModule {
    return {
      module: RuntimeConfigModule,
      global: true,
      providers: [{ provide: SERVER_CONFIG, useValue: config }],
      exports: [SERVER_CONFIG],
    };
  }
}
```

- **Diff concreto sobre `app.module.ts`**: a declaração de
  `SERVER_CONFIG` e o provider `{ provide: SERVER_CONFIG, useValue: serverConfig }`
  saem de `AppModule` e passam a viver em `RuntimeConfigModule`;
  `AppModule.forRoot` passa a importar `RuntimeConfigModule.forRoot(serverConfig)`
  em vez de prover `SERVER_CONFIG` diretamente.
- **Só `RuntimeConfigModule` é global** — é o único caso desta ADR em
  que `global: true` se justifica sem ressalva: `ServerConfig` é,
  literalmente, configuração cross-cutting (o mesmo raciocínio já
  aplicado a `ConfigModule.forRoot({ isGlobal: true })`, já presente em
  `app.module.ts`), não uma dependência técnica específica de domínio
  como Prisma/Redis.
- **Nunca relê `process.env`** — recebe `ServerConfig` já validado como
  parâmetro, mesma disciplina já usada por `AppModule.forRoot` hoje.

#### 2.2 `PrismaModule` e `PrismaService` — módulo estático, não-global

Com `SERVER_CONFIG` disponível globalmente, `PrismaService` o injeta
via `@Inject` comum — **nenhuma fábrica `.register(config)` é mais
necessária**, e `PrismaModule` volta a ser um `@Module` estático comum,
igual a `HealthModule` hoje:

```ts
// apps/api/src/prisma/prisma.service.ts
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(SERVER_CONFIG) config: ServerConfig) {
    super({ adapter: new PrismaPg({ connectionString: config.databaseUrl }) });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
```

```ts
// apps/api/src/prisma/prisma.module.ts
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

- **Conexão preguiçosa (lazy), nunca ansiosa (eager)**: sem mudança —
  `PrismaService` não implementa `OnModuleInit`, não chama `$connect()`.
  Construir a instância não abre socket; os 34 testes offline continuam
  passando sem Docker.
- **`$disconnect()` seguro mesmo sem nunca ter conectado**: mesmo
  critério de validação de sempre — `app.close()` continua limpo em
  [shutdown.spec.ts](../../apps/api/test/shutdown.spec.ts).
- **`extends PrismaClient` (herança) mantido** — a API gerada inteira
  do `PrismaClient` é exatamente a superfície que todo repository
  consome; padrão oficial do Prisma para NestJS, já observado como útil
  no repositório de referência.
- **Por que um módulo estático comum agora é seguro e suficiente**:
  módulos `@Module` estáticos (sem `.register()`/`.forRoot()`) são,
  pela própria semântica do Nest, compartilhados automaticamente — a
  primeira vez que `PrismaModule` é importado em qualquer ponto do
  grafo, seus providers são compilados uma única vez; todo import
  subsequente da mesma classe (em `AppModule`, `UsersModule`,
  `WorkspacesModule`, `PropertiesModule`, e futuramente `HealthModule`)
  reaproveita a mesma instância de `PrismaService` — sem precisar de
  `global: true` nem de qualquer truque de compartilhar o mesmo objeto
  `DynamicModule` por referência (a complicação que motivou a
  estratégia de módulos-fábrica da revisão anterior, agora
  desnecessária: essa complicação só existia porque `PrismaModule`
  precisava de um `config` passado por parâmetro; com `SERVER_CONFIG`
  resolvido via injeção comum, o problema desaparece).
- **Cada módulo consumidor precisa listar `PrismaModule` no seu próprio
  `imports`** para enxergar `PrismaService` — diferente de um módulo
  global, um módulo estático comum só expõe seus `exports` a quem o
  importa explicitamente. Isso é exatamente a visibilidade explícita
  pedida: abrir `users.module.ts` mostra, na própria lista de
  `imports`, que aquele módulo depende de `PrismaModule`.
- Token de injeção: a própria classe `PrismaService` (convenção padrão
  do Nest) — nenhuma interface é criada para desacoplar de uma
  implementação sem segunda variante (ADR 002).

#### 2.3 `RedisModule` e `RedisService` (`ioredis@6.0.0`)

Mesma forma de `PrismaModule` — módulo estático, não-global:

```ts
// apps/api/src/redis/redis.module.ts
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
```

`RedisService` (`@Injectable()`, detalhado por completo no §3, lifecycle
corrigido nesta revisão) pode ser registrado diretamente em `providers`
como qualquer outro provider comum do Nest — `SERVER_CONFIG` é
resolvido pelo `RuntimeConfigModule` global (§2.1) via `@Inject`, então
nenhuma factory manual (`useFactory`) é necessária, exatamente como já
vale para `PrismaService` (§2.2). `ioredis@6.0.0` continua a versão
exata a instalar em `apps/api/package.json` (`dependencies`) quando a
implementação começar.

#### 2.4 Wiring final

```ts
// app.module.ts
static forRoot(serverConfig: ServerConfig, options: AppModuleOptions = {}): DynamicModule {
  return {
    module: AppModule,
    imports: [
      RuntimeConfigModule.forRoot(serverConfig),
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
      LoggerModule.forRoot({ /* inalterado */ }),
      ThrottlerModule.forRoot([{ /* inalterado */ }]),
      PrismaModule,
      RedisModule,
      HealthModule,
      // UsersModule/WorkspacesModule/PropertiesModule: adicionados um de
      // cada vez, cada um exatamente na subtarefa em que seu Repository é
      // criado (ver §8) — nunca todos juntos, nunca como módulo vazio
      // antecipado.
    ],
    providers: [
      { provide: APP_GUARD, useClass: ThrottlerGuard },
      { provide: APP_FILTER, useClass: ProblemDetailsFilter },
    ],
    exports: [], // SERVER_CONFIG não é mais exportado por AppModule — vem de RuntimeConfigModule.
  };
}
```

- **`AppModule` importa `PrismaModule`/`RedisModule` diretamente na
  Tarefa 3.3**, mesmo antes de qualquer domínio os consumir — é isso
  que registra o lifecycle (`OnModuleDestroy`) de `PrismaService`/
  `RedisService` desde já, garantindo que `app.close()` os encerre
  corretamente mesmo antes de existir um Controller/Repository que os
  use de fato.
- **Módulos de domínio (`UsersModule`, `WorkspacesModule`,
  `PropertiesModule`)**: `@Module` estático comum, cada um
  explicitamente `imports: [PrismaModule]`:

  ```ts
  // apps/api/src/users/users.module.ts
  @Module({
    imports: [PrismaModule],
    providers: [UserRepository],
    exports: [UserRepository],
  })
  export class UsersModule {}
  ```

  (mesma forma para `WorkspacesModule`/`PropertiesModule`). Nenhuma
  função fábrica, nenhum parâmetro — `UserRepository` injeta
  `PrismaService` normalmente via construtor.

- **`HealthModule`, na Tarefa 3.4**, passará a `imports: [PrismaModule, RedisModule]`
  explicitamente para injetar `PrismaService`/`RedisService` no
  indicador de readiness — não antes; esta ADR/Tarefa 3.3 não altera
  `HealthModule`.
- **Instância única por contexto Nest**: garantida pela semântica
  padrão de módulos estáticos do Nest (§2.2) — não depende mais de
  nenhum mecanismo especial. Como verificação de regressão barata (não
  porque o mecanismo seja incerto), o teste de composição offline
  (§7.2) continua conferindo `moduleRef.get(PrismaService)` resolvido a
  partir de dois pontos do grafo.

### 3. `RedisService` — lifecycle corrigido

Mantém composição — `RedisService` **não estende** `Redis` — e
`lazyConnect: true`, com todas as opções abaixo revisadas.
`ioredis` expõe centenas de comandos (pub/sub, streams, scripting,
cluster) que este projeto não usa hoje (só `PING`); herdar essa
superfície inteira exporia todo esse catálogo a qualquer consumidor
futuro, incentivando chamadas de comando ad-hoc em vez de um conjunto
deliberado e revisado de métodos — inconsistente com a disciplina de
superfície mínima já aplicada aos repositories (ADR 002). Composição
também torna o teste unitário offline mais simples: `vi.mock('ioredis')`
(mesmo padrão já usado nesta stack de testes para dependências externas
— TARGET_ARCHITECTURE.md §13, mocks de Stripe/Mapbox) substitui o
client interno inteiro, sem precisar mockar métodos herdados no
protótipo de uma classe.

```ts
const REDIS_CONNECT_TIMEOUT_MS = 2000;
const REDIS_COMMAND_TIMEOUT_MS = 2000;
const REDIS_SHUTDOWN_TIMEOUT_MS = 2000;

/** Timer que decide contra uma promise: sempre limpa o próprio timer no
 *  `finally`, para nunca manter o event loop vivo mesmo quando `promise`
 *  vence a corrida antes do timeout. */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer!: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new RedisUnavailableError('Redis operation timed out.')),
      timeoutMs,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;
  private readonly logger = new Logger(RedisService.name);

  // Nenhuma factory manual é necessária: SERVER_CONFIG é resolvido pelo
  // RuntimeConfigModule global (§2.1) por injeção comum — RedisService
  // pode ser registrado diretamente em `providers: [RedisService]`
  // (ver RedisModule, §2.3), exatamente como qualquer outro provider
  // do Nest.
  constructor(@Inject(SERVER_CONFIG) config: ServerConfig) {
    this.client = new Redis(config.redisUrl, {
      lazyConnect: true,
      enableOfflineQueue: false,
      connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
      commandTimeout: REDIS_COMMAND_TIMEOUT_MS,
      // Finito e pequeno — apropriado para uma API HTTP com prazo de
      // resposta limitado. Ver "Por que não as opções do BullMQ" abaixo.
      maxRetriesPerRequest: 1,
      retryStrategy: (attempt) => Math.min(attempt * 200, 2000),
    });

    // Listener PERMANENTE de observabilidade — nunca removido, distinto
    // dos listeners temporários de waitUntilReady() abaixo (registrados/
    // removidos por chamada, via .once()/.off()). ioredis (EventEmitter)
    // derruba o processo com uma exceção não tratada se nenhum listener
    // de 'error' estiver registrado; os dois listeners (este e o
    // temporário de uma chamada em andamento) coexistem sem conflito —
    // ambos são notificados do mesmo evento. Mensagem fixa + só o
    // código do erro (ex.: 'ECONNREFUSED') — nunca a URL, credenciais
    // ou o objeto Error integral (que pode embutir a connection string
    // em alguns erros do driver).
    this.client.on('error', (err: NodeJS.ErrnoException) => {
      this.logger.error('Redis client error', { code: err.code ?? 'UNKNOWN' });
    });
  }

  /**
   * Nunca fica pendurado indefinidamente, e **nunca propaga um erro
   * bruto do `ioredis` diretamente** — todo erro que sai daqui é um
   * `RedisUnavailableError` normalizado (mensagem estática, `cause`
   * preservado quando existe uma causa original). Trata explicitamente
   * todo estado possível de `client.status` antes de enviar o comando:
   * - 'wait' (lazyConnect, nunca conectou): connect() explícito, sob timeout.
   * - 'connecting'/'reconnecting': aguarda 'ready', sob o mesmo timeout.
   * - 'ready': segue direto para o PING (que já carrega commandTimeout).
   * - 'close'/'end': falha IMEDIATAMENTE — nunca tenta enviar um comando
   *   numa conexão já encerrada (só pioraria o diagnóstico).
   * - qualquer outro estado não previsto: falha imediatamente também.
   */
  async ping(): Promise<string> {
    try {
      switch (this.client.status) {
        case 'wait':
          await withTimeout(this.client.connect(), REDIS_CONNECT_TIMEOUT_MS);
          break;
        case 'connecting':
        case 'reconnecting':
          await this.waitUntilReady(REDIS_CONNECT_TIMEOUT_MS);
          break;
        case 'ready':
          break;
        case 'close':
        case 'end':
          throw new RedisUnavailableError('Redis connection is closed.');
        default:
          throw new RedisUnavailableError(
            'Redis client is in an unexpected state.',
          );
      }
      return await this.client.ping();
    } catch (error) {
      // connect()/waitUntilReady()/os ramos de estado acima já lançam
      // RedisUnavailableError normalizado — preservado como está, nunca
      // envolvido duas vezes. Qualquer outro erro (ex.: connect() ou
      // ping() rejeitando com um erro bruto do driver, fora do caminho
      // do timeout) é encapsulado aqui, na única saída da função —
      // garante que `ping()` nunca deixa escapar `error.message`,
      // stack ou qualquer detalhe do driver que possa embutir a URL ou
      // credenciais de conexão.
      if (error instanceof RedisUnavailableError) {
        throw error;
      }
      throw new RedisUnavailableError('Redis is unavailable.', {
        cause: error,
      });
    }
  }

  /**
   * Resolve no evento 'ready', rejeita no 'error' ou no timeout — e, em
   * QUALQUER uma das três saídas, remove os dois listeners temporários
   * e limpa o timer, via o `cleanup()` compartilhado abaixo. Nunca um
   * `Promise.race` que decide externamente e abandona listener/timer
   * ainda registrados no client: a limpeza acontece de dentro da própria
   * Promise, não de fora dela. Rejeita sempre com `RedisUnavailableError`
   * já normalizado — nunca repassa o `Error` bruto do evento `'error'`
   * do `ioredis`.
   */
  private waitUntilReady(timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const cleanup = (): void => {
        clearTimeout(timer);
        this.client.off('ready', onReady);
        this.client.off('error', onError);
      };
      const onReady = (): void => {
        cleanup();
        resolve();
      };
      const onError = (err: Error): void => {
        cleanup();
        reject(
          new RedisUnavailableError('Redis connection failed.', { cause: err }),
        );
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new RedisUnavailableError('Redis connection timed out.'));
      }, timeoutMs);

      this.client.once('ready', onReady);
      this.client.once('error', onError);
    });
  }

  isReady(): boolean {
    return this.client.status === 'ready';
  }

  /** Idempotente: seguro chamar mais de uma vez (ex.: shutdown hooks duplicados) — reler `client.status` a cada chamada, nunca assume estado anterior. */
  async onModuleDestroy(): Promise<void> {
    if (this.client.status === 'ready') {
      try {
        await withTimeout(this.client.quit(), REDIS_SHUTDOWN_TIMEOUT_MS);
        return;
      } catch {
        // quit() não respondeu a tempo, ou falhou — cai para o encerramento forçado abaixo.
      }
    }
    // Nunca conectou, já encerrado, ou quit() falhou/expirou: encerramento
    // imediato, sem I/O de rede — nunca deixa app.close() travado.
    this.client.disconnect();
  }
}
```

**`RedisUnavailableError`** — erro interno próprio para indisponibilidade
do Redis (`apps/api/src/redis/redis-unavailable.error.ts`), fora da
hierarquia `PersistenceError` (§5 — é específico do client Redis, não
de um Repository/agregado Prisma):

```ts
export class RedisUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'RedisUnavailableError';
  }
}
```

`message` é sempre um dos textos estáticos acima (`'Redis operation
timed out.'`, `'Redis connection is closed.'`, `'Redis client is in an
unexpected state.'`, `'Redis connection timed out.'`, `'Redis
connection failed.'`, `'Redis is unavailable.'`) — nunca a URL,
credenciais, ou a mensagem bruta de um erro do driver `ioredis`.

**Garantia de `ping()`: nenhum erro bruto do `ioredis` sai diretamente**
— todo erro originado em `client.connect()`, `waitUntilReady()`,
`client.ping()`, num estado inválido do client, ou num timeout, sai
como `RedisUnavailableError`. `waitUntilReady`'s `onError` já normaliza
na origem (`new RedisUnavailableError('Redis connection failed.', { cause: err })`);
o `try/catch` que envolve o corpo de `ping()` é a rede de segurança
final — preserva um `RedisUnavailableError` já normalizado sem
envolvê-lo de novo, e encapsula qualquer outro erro inesperado
(`client.connect()`/`client.ping()` rejeitando fora do caminho de
timeout) como `new RedisUnavailableError('Redis is unavailable.', { cause: error })`.
Isso não altera lifecycle, timeouts ou política de retry já aprovados —
é só a garantia de que a fronteira pública de `RedisService` nunca
expõe um erro do driver diretamente.

#### 3.1 Opções — tabela final

| Opção                                   | Valor                                                  | Justificativa                                                                                                                                                                 |
| --------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lazyConnect`                           | `true`                                                 | Construir o service não pode abrir socket, ou os 34 testes offline quebram sem Docker.                                                                                        |
| `enableOfflineQueue`                    | `false`                                                | Sem isso, um comando acidental na suíte offline ficaria enfileirado indefinidamente — vira erro imediato e explícito em vez de hang silencioso.                               |
| `connectTimeout`                        | `2000`ms                                               | Finito — nenhuma tentativa de conexão trava `ping()` indefinidamente.                                                                                                         |
| `commandTimeout`                        | `2000`ms                                               | Finito — nenhum comando individual trava indefinidamente mesmo com conexão estabelecida mas servidor não respondendo.                                                         |
| `maxRetriesPerRequest`                  | `1`                                                    | Finito e pequeno — apropriado para uma requisição HTTP com prazo de resposta; ver "Por que não as opções do BullMQ" abaixo.                                                   |
| `retryStrategy`                         | `(n) => Math.min(n × 200, 2000)`                       | Backoff linear limitado a 2s para a **reconexão do socket** (eixo diferente de `maxRetriesPerRequest`, que limita quantas vezes um comando específico espera pela reconexão). |
| Listener `on('error', …)`               | Sempre registrado, mensagem fixa + `err.code` apenas   | Obrigatório (evita derrubar o processo); nunca loga URL, credenciais ou o objeto `Error` inteiro.                                                                             |
| `isReady()`                             | `status === 'ready'`                                   | Reuso direto pela Tarefa 3.4, sem recriar client.                                                                                                                             |
| `ping()` em `status === 'wait'`         | `connect()` explícito, sob timeout                     | Torna a transição lazy → conectado uma etapa observável e limitada no tempo, em vez de depender do auto-connect implícito do `ioredis` ao enviar um comando.                  |
| `ping()` em `connecting`/`reconnecting` | Aguarda `'ready'`, sob o mesmo timeout                 | Nunca espera indefinidamente por uma reconexão em andamento.                                                                                                                  |
| Encerramento                            | `quit()` se `ready`, com timeout; senão `disconnect()` | Gracioso quando possível, nunca trava `app.close()`; idempotente por natureza (reler `status` a cada chamada).                                                                |

#### 3.2 Por que a configuração do client da API não reutiliza as opções do BullMQ worker

`maxRetriesPerRequest: 1` (finito) é deliberadamente **oposto** ao que
BullMQ exige (`maxRetriesPerRequest: null`, indefinido) — e essa
diferença não é um descuido, é a consequência direta de dois contextos
de uso diferentes:

- **Este client (API HTTP)**: cada chamada (`ping()`, e futuramente
  qualquer leitura de cache) acontece dentro do ciclo de
  requisição-resposta de uma API HTTP, que tem um prazo de resposta
  implícito (o cliente HTTP do lado de fora não espera para sempre).
  Deixar um comando reter a requisição por trás de retries indefinidos
  contrariaria esse prazo — falhar rápido (no máximo 1 retry) e deixar
  a camada de readiness reportar `503` é o comportamento correto.
- **O worker BullMQ futuro (Fase 4)**: processa jobs em background, sem
  um prazo de resposta HTTP esperando. BullMQ [documenta
  explicitamente](https://docs.bullmq.io/) que sua própria conexão
  `ioredis` precisa de `maxRetriesPerRequest: null` — do contrário,
  comandos de bloqueio internos do BullMQ (`BRPOPLPUSH` e afins) podem
  falhar prematuramente em vez de aguardar o tempo que o processamento
  de fila realmente precisa.

Compartilhar uma única conexão/configuração entre os dois contextos
forçaria um dos dois a operar com o comportamento errado. Por isso — e
porque `RedisService` já foi desenhado como um wrapper estreito e de
propósito específico (início do §3) — o worker, ao ser criado, terá sua
**própria** instância `ioredis`, com suas próprias opções, nunca
reaproveitando `RedisService` desta ADR.

### 4. Repositories por agregado

Um repository por agregado, nunca por tabela Prisma; operações
atômicas sobre tabelas do mesmo agregado pertencem ao repository desse
agregado, **inteiramente dentro de uma única `prisma.$transaction`**
(nunca com consultas de pré-condição fora dela — corrigido nesta
revisão, ver §4.2); nenhuma transação cruza agregados.

#### 4.1 `UserRepository` — `apps/api/src/users/`

Agregado: `User` + `Credential` + `AuthIdentity` + `UserRole` +
`CustomerProfile` + `AgentProfile` + `AgentLicense`.

- `createWithCredential(cmd: CreateUserWithCredentialCommand): Promise<UserAggregateResult>`
- `createWithAuthIdentity(cmd: CreateUserWithAuthIdentityCommand): Promise<UserAggregateResult>`
- `findById(id: string): Promise<UserAggregateResult | null>`
- `findByEmail(email: string): Promise<UserAggregateResult | null>`

**Papéis iniciais — validação completa, antes de qualquer query**:

1. `roleNames.length === 0` → `PersistenceInvariantError('ROLE_REQUIRED')`.
2. `new Set(roleNames).size !== roleNames.length` (duplicata) →
   `PersistenceInvariantError('DUPLICATE_ROLE_NAME')`.
3. Só então, dentro da transação, resolve os nomes **únicos** pedidos
   para `Role.id` (`prisma.role.findMany({ where: { name: { in: [...new Set(roleNames)] } } })`).
   Se o número de linhas retornadas for menor que o número de nomes
   únicos pedidos → `PersistenceInvariantError('ROLE_NOT_FOUND')` (não
   deveria acontecer, já que `Role` é um catálogo seedado e fechado —
   ver ADR 007 — mas o Repository não assume isso silenciosamente).

Os passos 1 e 2 são validação pura de entrada (sem tocar o banco) —
testáveis offline, sem `test/infra/`. O passo 3 é o único que depende
do catálogo real.

**Tratamento de erros**:

| Cenário                                                        | Erro                                                  | Como é detectado                                                                                                 |
| -------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `roleNames` vazio                                              | `PersistenceInvariantError('ROLE_REQUIRED')`          | Validação de entrada, antes de qualquer query.                                                                   |
| `roleNames` com duplicata                                      | `PersistenceInvariantError('DUPLICATE_ROLE_NAME')`    | Validação de entrada, antes de qualquer query.                                                                   |
| Papel inexistente no catálogo                                  | `PersistenceInvariantError('ROLE_NOT_FOUND')`         | Resolução de nomes únicos retorna menos linhas que o pedido.                                                     |
| E-mail já existente                                            | `PersistenceConflictError('DUPLICATE_EMAIL')`         | Unique de `users.email` (`citext`) — reconhecido pelo `target` específico do erro `P2002`, ver §5.               |
| Identidade OAuth já existente                                  | `PersistenceConflictError('DUPLICATE_AUTH_IDENTITY')` | Unique de `(provider, providerAccountId)` — idem.                                                                |
| Usuário não encontrado (métodos futuros que exigem existência) | `AggregateNotFoundError('USER_NOT_FOUND')`            | Nenhum método atual precisa disto — reservado para um método de atualização futuro (ex.: vincular `Credential`). |
| Falha de optimistic locking                                    | N/A nesta tarefa                                      | `User.version` existe mas nenhum método atual faz update com CAS — mesmo padrão do item acima quando for criado. |

**Normalização — quem faz o quê**: o Repository **assume** que
`email` já chega sem espaço externo. Nunca chama `.trim()`/
`.toLowerCase()` sozinho — responsabilidade de quem monta o Command
(hoje, o código de teste; no futuro, a Service). O `CHECK
users_email_trimmed` do banco continua sendo a rede de segurança
final, nunca a primeira linha de defesa.

`UsersModule` só declara/exporta `UserRepository` — sem Controller.

#### 4.2 `WorkspaceRepository` — `apps/api/src/workspaces/`

Agregado: `Workspace` + `WorkspaceMembership` +
`WorkspaceMembershipRole` + `WorkspaceAgent` + `Brokerage`.

**Atomicidade completa — corrigido nesta revisão**: toda a sequência
abaixo acontece **dentro da mesma `$transaction`**, sem nenhuma
consulta de pré-condição feita antes de abrir a transação:

```ts
async createIndividualWorkspace(cmd: CreateIndividualWorkspaceCommand): Promise<WorkspaceRecord> {
  return this.prisma.$transaction(async (tx) => {
    const owner = await tx.user.findUnique({ where: { id: cmd.ownerUserId } });
    if (!owner) {
      throw new AggregateNotFoundError('Owner user not found.', 'OWNER_NOT_FOUND');
    }

    const agentProfile = await tx.agentProfile.findUnique({ where: { userId: cmd.ownerUserId } });
    if (!agentProfile) {
      throw new PersistenceInvariantError('Owner has no AgentProfile.', 'AGENT_PROFILE_REQUIRED');
    }

    const workspace = await tx.workspace.create({
      data: { type: 'INDIVIDUAL', name: cmd.name, slug: cmd.slug, ownerUserId: cmd.ownerUserId },
    });
    const membership = await tx.workspaceMembership.create({
      data: { workspaceId: workspace.id, userId: cmd.ownerUserId, status: 'ACTIVE' },
    });
    await tx.workspaceMembershipRole.createMany({
      data: [
        { membershipId: membership.id, role: 'MANAGER' },
        { membershipId: membership.id, role: 'AGENT' },
      ],
    });
    await tx.workspaceAgent.create({
      data: { workspaceId: workspace.id, userId: cmd.ownerUserId, status: 'ACTIVE' },
    });

    return toWorkspaceRecord(workspace);
  });
}
```

`createBrokerageWorkspace` segue a mesma forma, tudo dentro de uma
única transação: consulta de `User`; consulta de `AgentProfile` (só se
`cmd.ownerActsAsAgent`); criação de `Workspace` (`type: 'BROKERAGE'`);
criação de `Brokerage`; criação do `WorkspaceMembership` `ACTIVE`;
atribuição do papel `MANAGER` (e, condicionalmente, `AGENT` +
`WorkspaceAgent` `ACTIVE`). É o **caminho normal de escrita** que a
ADR 007 exige para a invariante `Workspace.BROKERAGE ⇒ existe
exatamente um Brokerage` — sem ele, essa invariante ficaria sem nenhum
caminho de aplicação.

- `findById(id: string): Promise<WorkspaceRecord | null>`.

**Por que as consultas de `User`/`AgentProfile` continuam existindo,
mesmo dentro da transação**: são o que produz um erro com `reason`
preciso (`OWNER_NOT_FOUND`/`AGENT_PROFILE_REQUIRED`) em vez de deixar o
banco rejeitar com uma violação de FK genérica. **A FK continua sendo a
defesa final contra remoção concorrente**: como o nível de isolamento é
`Read Committed` (§6), um `SELECT` dentro da transação não trava a
linha lida — uma linha consultada no início da transação pode ser
removida por outra transação antes do `INSERT` que depende dela. Dois
pontos exatos onde isso pode acontecer, ambos cobertos:

1. **`User` removido entre a consulta e o `INSERT` de `Workspace`**: o
   `INSERT` falha por violação de FK (`P2003` em
   `workspaces.owner_user_id`), que o Repository traduz para
   `OWNER_NOT_FOUND` (mesmo `reason` da checagem proativa, origem
   diferente — ver §5).
2. **`AgentProfile` removido entre a consulta e o `INSERT` de
   `WorkspaceAgent`** (corrida residual, mais tardia na mesma
   transação — o `AgentProfile` foi confirmado no início, mas
   `WorkspaceAgent` só é criado depois de `Workspace`/`membership`/
   papéis): o `INSERT` de `WorkspaceAgent` falha por violação da FK
   **`workspace_agents.user_id → agent_profiles.user_id`**, que o
   Repository reconhece — **somente para essa operação e essa
   constraint exata** — e traduz para `AGENT_PROFILE_REQUIRED` (mesmo
   `reason` da checagem proativa, origem diferente). Qualquer outra FK
   inesperada nesse mesmo `INSERT` (ex.: uma violação que o Repository
   não reconhece de antemão para esse call site) **não** é rotulada
   como `AGENT_PROFILE_REQUIRED` por adivinhação — vira
   `UnexpectedPersistenceError` (§5.1).

**Tradução de erros conhecidos**: `DUPLICATE_WORKSPACE_SLUG`
(unicidade `citext` de `workspaces.slug`, `P2002`); `OWNER_NOT_FOUND`
(consulta prévia dentro da tx, **ou** `P2003` em
`workspaces.owner_user_id`); `AGENT_PROFILE_REQUIRED` (consulta prévia
dentro da tx, **ou** `P2003` em `workspace_agents.user_id`, item 2
acima).

**Fora de escopo desta tarefa**: convite/gestão de membership além da
criação inicial, transferência de titularidade (`ownerUserId`).

`WorkspacesModule` só declara/exporta `WorkspaceRepository`.

#### 4.3 `PropertyRepository` — `apps/api/src/properties/`

Agregado: `Property` + `Address`.

- **`createProperty(cmd: CreatePropertyCommand): Promise<PropertyWithAddressResult>`**:
  1. `workspaceId` sempre explícito (dentro do próprio `cmd`).
  2. Dentro da transação, primeira operação: `SELECT ... FOR UPDATE`
     na linha de `WorkspaceAgent` (ver §6.1) para
     `(cmd.workspaceId, cmd.responsibleAgentUserId)`. Se não existir ou
     não estiver `ACTIVE`, `PersistenceInvariantError('RESPONSIBLE_AGENT_NOT_ACTIVE')`,
     sem escrever nada. A FK composta `(workspace_id, responsible_agent_user_id) → workspace_agents`
     continua como defesa em profundidade independente (ver §7.4).
  3. Cria `Property` via Prisma Client normal; cria `Address` via SQL
     parametrizado (`Prisma.sql`, nunca `Unsafe`/concatenação),
     omitindo `id` (default nativo `uuidv7()`), com
     `RETURNING id, address_line_1, address_line_2, district,
country_code, region_code, locality, postal_code,
ST_Y(location::geometry) AS latitude, ST_X(location::geometry) AS longitude,
created_at, updated_at` — nunca expõe o formato binário do PostGIS.
- **`findByIdInWorkspace(workspaceId: string, id: string): Promise<PropertyWithAddressResult | null>`**
  — se a `Property` existir mas a leitura (`LEFT JOIN`/consulta
  separada) não encontrar `Address`, lança
  `PersistenceInvariantError('PROPERTY_ADDRESS_MISSING')` em vez de
  retornar um resultado com `address` ausente (o tipo `PropertyWithAddressResult.address`
  não é opcional — ver §1). Esse estado nunca é produzido pelo caminho
  normal deste Repository (`createProperty` sempre cria os dois juntos)
  — só seria alcançável por manipulação direta do banco fora do
  Repository; ainda assim, o Repository nunca finge que não aconteceu.
- **`updatePropertyStatus(cmd: UpdatePropertyStatusCommand): Promise<PropertyWithAddressResult>`**
  — quatro passos, **todos dentro da mesma `prisma.$transaction`**:
  1. CAS via `UPDATE ... RETURNING` (§6): `version = version + 1`,
     `publishedAt`/`archivedAt` computados pelo Repository de acordo com
     a coerência da ADR 007 — o chamador nunca informa timestamps.
  2. Se o CAS retornar zero linhas, desambiguação (segunda consulta
     somente leitura, ainda dentro da mesma transação): linha ausente →
     `AggregateNotFoundError('PROPERTY_NOT_FOUND')`; linha existe com
     `version` diferente → `OptimisticConcurrencyError('PROPERTY_VERSION_CONFLICT')`.
  3. Leitura de `Address` (mesma transação). Se a `Property` foi
     atualizada com sucesso no passo 1 mas não tem `Address`, lança
     `PersistenceInvariantError('PROPERTY_ADDRESS_MISSING')` — **mesmo
     reason** de `findByIdInWorkspace` acima, mas descoberto **depois**
     do CAS já ter sucesso, não antes de qualquer escrita (ver a nota
     de formulação em §5.1).
  4. Montagem de `PropertyWithAddressResult` a partir da `Property`
     atualizada + o `Address` lido.
     **Se o passo 3 lançar, a transação inteira sofre rollback**: o
     `UPDATE` do passo 1 (que já tinha sucesso) é desfeito — `status`,
     `publishedAt`/`archivedAt` e `version` voltam exatamente ao valor
     anterior à chamada, nunca ficam "parcialmente aplicados". Esse
     comportamento é exatamente o que a suíte de infraestrutura obrigatória
     do §7.3 prova.

**Reatribuição** (`reassignResponsibleAgent`) não é criada nesta
tarefa — quando existir, reaproveita a mesma checagem com lock de linha
do passo 2 acima. Imóveis já existentes continuam podendo referenciar
um `WorkspaceAgent` depois suspenso/revogado (ADR 007) — nenhum método
"corrige" isso.

`PropertiesModule` só declara/exporta `PropertyRepository`.

### 5. Erros internos

Módulo compartilhado: `apps/api/src/persistence/errors.ts`.

**Correção sobre a revisão anterior**: o pseudocódigo antes declarava o
construtor de `PersistenceError` como `protected`, mas em seguida
instanciava subclasses sem construtor próprio (`new AggregateNotFoundError(...)`)
— inválido, já que uma subclasse sem construtor próprio herda a
acessibilidade do construtor do pai, permanecendo `protected` e portanto
não instanciável de fora do módulo. **Solução escolhida**: o construtor
de `PersistenceError` passa a ser **público** — evita o boilerplate de
declarar um construtor idêntico em cada uma das cinco subclasses; como
`PersistenceError` continua `abstract`, ela **continua** não podendo ser
instanciada diretamente (`new PersistenceError(...)` é erro de
compilação independentemente da visibilidade do construtor — `abstract`
já impede isso sozinho). `reason` passa a ser um catálogo estável
(union de literais), não `string` livre. `name` é resolvido
automaticamente para o nome da subclasse concreta, sem nenhum código
extra em cada subclasse:

```ts
export type PersistenceErrorReason =
  | 'DUPLICATE_EMAIL'
  | 'DUPLICATE_AUTH_IDENTITY'
  | 'DUPLICATE_WORKSPACE_SLUG'
  | 'OWNER_NOT_FOUND'
  | 'AGENT_PROFILE_REQUIRED'
  | 'RESPONSIBLE_AGENT_NOT_ACTIVE'
  | 'ROLE_REQUIRED'
  | 'DUPLICATE_ROLE_NAME'
  | 'ROLE_NOT_FOUND'
  | 'USER_NOT_FOUND'
  | 'PROPERTY_NOT_FOUND'
  | 'PROPERTY_VERSION_CONFLICT'
  | 'PROPERTY_ADDRESS_MISSING'
  | 'UNEXPECTED_PERSISTENCE_ERROR';

export abstract class PersistenceError extends Error {
  constructor(
    message: string,
    readonly reason: PersistenceErrorReason,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    // `this.constructor` resolve para a subclasse concreta em tempo de
    // execução (ex.: "AggregateNotFoundError"), mesmo escrito aqui na
    // base — nenhuma subclasse precisa declarar isso por conta própria.
    this.name = this.constructor.name;
  }
}

export class AggregateNotFoundError extends PersistenceError {}
export class OptimisticConcurrencyError extends PersistenceError {}
export class PersistenceConflictError extends PersistenceError {}
export class PersistenceInvariantError extends PersistenceError {}
/** Erro do driver pg/Prisma não reconhecido para aquela operação específica — nunca rotulado como not-found/conflict por adivinhação. */
export class UnexpectedPersistenceError extends PersistenceError {}
```

`cause` é sempre preservado (via `options.cause`, herdado do `Error`
nativo) quando o erro envolve uma causa original do driver — nunca
descartado. A mensagem pública (`message`) é sempre um texto estático
escrito pelo Repository, nunca repassada de `error.message` do driver
(ver §5.1).

#### 5.1 Tradução — só quando o Repository reconhece, com segurança, a operação e a constraint

Não existe um `catch` genérico reagindo a qualquer `P2002`/`P2003`. Cada
ponto de escrita só traduz os erros que ele mesmo sabe, de antemão, que
podem vir daquela chamada específica — inspecionando
`error.meta?.target` (Prisma expõe os campos/constraint envolvidos em
violações de unicidade) e comparando com a constraint exata esperada
**naquele call site**:

```ts
try {
  return await tx.user.create({ data: { email: cmd.email /* ... */ } });
} catch (error) {
  if (isUniqueViolation(error, USERS_EMAIL_UNIQUE_TARGET)) {
    throw new PersistenceConflictError(
      'Email already registered.',
      'DUPLICATE_EMAIL',
      {
        cause: error,
      },
    );
  }
  throw wrapUnexpectedPersistenceError(error);
}
```

`wrapUnexpectedPersistenceError` decide: se já é um `PersistenceError`
(lançado por uma checagem interna anterior, ex.: `AGENT_PROFILE_REQUIRED`),
relança sem alterar; senão, envolve em `UnexpectedPersistenceError`
preservando `cause` — nunca rotulado como um dos quatro tipos
específicos por adivinhação.

**Tabela de tradução conhecida, por operação**:

| Operação                                                                                                | Constraint Postgres                                                                             | Reason                                                                                                   |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `UserRepository.createWithCredential`/`createWithAuthIdentity`                                          | unique `users.email` (`citext`)                                                                 | `DUPLICATE_EMAIL`                                                                                        |
| `UserRepository.createWithAuthIdentity`                                                                 | unique `(provider, provider_account_id)`                                                        | `DUPLICATE_AUTH_IDENTITY`                                                                                |
| `WorkspaceRepository.createIndividualWorkspace`/`createBrokerageWorkspace`                              | FK `workspaces.owner_user_id → users.id`                                                        | `OWNER_NOT_FOUND`                                                                                        |
| `WorkspaceRepository.createIndividualWorkspace`/`createBrokerageWorkspace`                              | unique `workspaces.slug` (`citext`)                                                             | `DUPLICATE_WORKSPACE_SLUG`                                                                               |
| `WorkspaceRepository.createIndividualWorkspace`/`createBrokerageWorkspace` (corrida residual, ver §4.2) | FK `workspace_agents.user_id → agent_profiles.user_id`, **somente nesta operação e constraint** | `AGENT_PROFILE_REQUIRED`                                                                                 |
| `PropertyRepository.createProperty`/`updatePropertyStatus` (CAS zero linhas)                            | linha ausente vs. `version` divergente (consulta de desambiguação, não erro Postgres)           | `AggregateNotFoundError('PROPERTY_NOT_FOUND')`/`OptimisticConcurrencyError('PROPERTY_VERSION_CONFLICT')` |

Invariantes proativas (`ROLE_REQUIRED`, `DUPLICATE_ROLE_NAME`,
`ROLE_NOT_FOUND`, `RESPONSIBLE_AGENT_NOT_ACTIVE`, a checagem inicial de
`AGENT_PROFILE_REQUIRED` em `WorkspaceRepository`) são verificadas
**antes da escrita, quando possível** — nunca passam por um erro de
banco, são `PersistenceInvariantError` lançados diretamente pelo código
do Repository. Já **invariantes descobertas durante uma operação
composta** (ex.: `PROPERTY_ADDRESS_MISSING` em `updatePropertyStatus`,
detectado **depois** do CAS ter sucesso — ver §4.3; ou a corrida
residual de `AGENT_PROFILE_REQUIRED` traduzida a partir de uma violação
de FK real, ver §4.2) não têm como ser verificadas antes de qualquer
escrita por definição — nesses casos, a invariante provoca o **rollback
integral da transação** em vez de impedir a escrita de começar; o efeito
observável (nada persiste) é o mesmo.

**Erros desconhecidos**: qualquer erro do driver `pg`/Prisma fora da
tabela acima — para aquele call site específico — nunca é rotulado
como `AggregateNotFoundError`/`PersistenceConflictError` por
adivinhação. Vira `UnexpectedPersistenceError`, com `cause` preservado.
`message` é **sempre** um texto estático escrito pelo Repository (ex.:
`'Email already registered.'`) — nunca `error.message` do driver
repassado, que pode conter SQL ou a connection string. `cause` mantém
o erro original para diagnóstico interno (logs), mas nunca é
serializado de volta para um cliente — quem construir a tradução para
Problem Details no futuro precisa preservar essa regra.

Tradução para Problem Details continua **fora de escopo** desta tarefa
(depende de Controller/Service).

### 6. Concorrência e transações

- **Padrão CAS**: `UPDATE ... SET version = version + 1, ... WHERE id = $1 [AND workspace_id = $2] AND version = $3 RETURNING *`,
  via `Prisma.sql`/`$queryRaw`, um único round-trip. Zero linhas
  retornadas → segunda consulta somente leitura distingue
  `AggregateNotFoundError('PROPERTY_NOT_FOUND')` (linha não existe) de
  `OptimisticConcurrencyError('PROPERTY_VERSION_CONFLICT')` (linha
  existe, `version` diferente) — ver §4.3 para a sequência completa
  dentro da mesma transação, incluindo a checagem de `Address`.
- **Nunca exceções HTTP** — erros internos puros (§5); tradução para
  Problem Details é responsabilidade futura.
- **Isolamento**: `Read Committed` (padrão Prisma/Postgres) para toda
  `$transaction` — nenhum modo `Serializable` global.
- **Retry**: nenhum, nesta tarefa — repositories nunca re-tentam
  sozinhos; decidir isso é responsabilidade de uma Service futura.

#### 6.1 Corrida concreta: agente revogado entre a checagem e a escrita

Cenário: (1) `createProperty` verifica `WorkspaceAgent.ACTIVE`; (2)
outra transação revoga esse agente; (3) `createProperty` cria a
`Property`.

**Estratégia escolhida**: `SELECT status FROM workspace_agents WHERE workspace_id = $1 AND user_id = $2 FOR UPDATE`
como primeira instrução da transação de `createProperty` (§4.3, passo 2)
— não uma consulta separada antes da transação.

Qualquer transação que revoga esse `WorkspaceAgent` também precisa do
lock de escrita da mesma linha. Se `createProperty` trava primeiro, a
revogação espera até o commit/rollback dele — correto, já que
`Property`s existentes podem seguir referenciando um agente depois
revogado (ADR 007). Se a revogação trava primeiro, `createProperty`
espera, relê `REVOKED`/`SUSPENDED` depois de destravar, e lança
`RESPONSIBLE_AGENT_NOT_ACTIVE` sem persistir nada.

**Por que não `Serializable` + retry**: isolaria a transação inteira
contra qualquer conflito, não só na linha do `WorkspaceAgent`, exigindo
retry-em-falha-de-serialização em todo método que a usasse — mais caro
e menos previsível que o lock pontual para esta invariante específica.

### 7. Estratégia de testes

Quatro categorias, com fronteiras explícitas, mais uma nota específica
sobre o uso de Redis nos testes desta fase.

#### 7.1 Testes unitários offline dos repositories

`*.spec.ts` ao lado do código-fonte (`api:test`, cacheável).
`PrismaService` substituído por stub/mock — cada teste afirma a chamada
Prisma montada (tabela, `where`, `data`, transação), sem tocar Postgres
real. Cobre também os ramos que nunca chegam ao banco: `ROLE_REQUIRED`,
`DUPLICATE_ROLE_NAME`, `ROLE_NOT_FOUND` (mock de `role.findMany`
retornando menos linhas), `AGENT_PROFILE_REQUIRED`.

#### 7.2 Teste offline de composição do `AppModule`

`apps/api/test/` (offline, `api:test:integration`): confirma que
`AppModule.forRoot(TEST_SERVER_CONFIG)` continua compondo com
`RuntimeConfigModule`/`PrismaModule`/`RedisModule` importados (§2), que
`app.close()` continua limpo, e que `moduleRef.get(PrismaService)`/
`moduleRef.get(RedisService)` resolvem a mesma instância em dois pontos
do grafo. **Nenhum dos 34 testes existentes muda de comportamento.**

#### 7.3 Testes reais através da API pública dos repositories

`apps/api/test/infra/` (`api:test:integration:infra`, `cache: false`),
contra o profile padrão do Compose. Cobre o que o Repository consegue
produzir pelo seu próprio código: caminho feliz de cada método;
`DUPLICATE_EMAIL`/`DUPLICATE_AUTH_IDENTITY`;
`RESPONSIBLE_AGENT_NOT_ACTIVE` com agente real de outro workspace ou
suspenso/revogado; `AGENT_PROFILE_REQUIRED`; `OWNER_NOT_FOUND`;
`DUPLICATE_WORKSPACE_SLUG`; `OptimisticConcurrencyError`/
`AggregateNotFoundError` via `updatePropertyStatus` real;
`PrismaService`/`RedisService` conectando e respondendo de verdade.

**Teste obrigatório — rollback de `updatePropertyStatus` sobre
`PROPERTY_ADDRESS_MISSING`** (prova o passo 3/a nota de rollback do
§4.3): (1) fixture de `Property` **sem** `Address` criada diretamente
no nível de contrato (`apps/api/test/infra/contract/`, mesmo mecanismo
do §7.4 — o `PropertyRepository` normal não tem caminho para produzir
essa fixture sozinho); (2) chamada real de
`propertyRepository.updatePropertyStatus(...)`; (3) afirma que rejeita
com `PersistenceInvariantError('PROPERTY_ADDRESS_MISSING')`; (4) uma
consulta posterior (via `PrismaService`, fora do Repository) confirma
que `status`, `publishedAt`/`archivedAt` e `version` da `Property`
continuam **exatamente** como antes da chamada — provando que o
`UPDATE` do passo 1 do CAS foi desfeito pelo rollback da transação, não
deixado "meio aplicado".

#### 7.4 Testes de contrato do schema (bypassam o Repository, deliberadamente)

`apps/api/test/infra/contract/` fala diretamente com
`PrismaService`/SQL raw, contornando o Repository, para os estados que
o desenho do Repository já torna inatingíveis pelo caminho normal:
lifecycle incoerente de `Property`; `version = 0`; formato de
`countryCode`/`currency`/`addressLine1`/`district`; `AgentLicense` com
jurisdição/número duplicados por caixa (`citext`); `Address` cross-
tenant; FK composta `Property → WorkspaceAgent` como defesa em
profundidade independente da checagem com lock (§6.1); `PROPERTY_ADDRESS_MISSING`
simulado com uma exclusão direta de `Address` fora do Repository.
**Nenhum método inseguro é criado no Repository só para permitir esses
testes.**

**Validação de formato antes de escrever**: os campos sensíveis a
`CHECK` (`countryCode`, `currency`, `addressLine1`/`district` trimados
e não vazios) são verificados por uma função de guarda leve, colocada
junto dos tipos de comando (§1) — não um schema Zod completo (isso é
concern de DTO/Controller, fora de escopo) — que lança
`PersistenceInvariantError` **antes** de qualquer SQL ser montado. É
essa validação prévia que torna os `CHECK`s de formato inatingíveis
pelo caminho normal do Repository, motivando o teste de contrato acima.

#### 7.5 Execução serial e isolamento

`vitest.integration.infra.config.mts`: `test.fileParallelism: false`;
`test.pool: 'forks'`, `test.poolOptions.forks.singleFork: true`;
nenhum `describe.concurrent`/`it.concurrent`; `setupFiles` registrando
um `beforeEach` global que roda o `TRUNCATE` guardado (as quatro
guardas da ADR 006, reexecutadas em toda chamada) sobre as 14 tabelas
de domínio mutáveis. **Nenhuma suíte vazia, nenhum `passWithNoTests`**
— nasce junto com o primeiro teste real (§8, subtarefa 4).

#### 7.6 Redis nos testes desta fase

Os testes reais de Redis desta tarefa (§7.3) **só executam `connect`/
`PING`** — nenhuma escrita de dados no Redis compartilhado:

- **`FLUSHDB` não é usado** nesta tarefa — não há dado nenhum para
  limpar, porque nenhum teste desta fase grava no Redis.
- **Nenhuma mutação do Redis compartilhado** acontece nesta tarefa.
- Quando cache de aplicação ou BullMQ (Fase 4) começarem a gravar dados
  reais no Redis, uma estratégia própria de isolamento (namespace de
  chaves dedicado, ou um banco Redis lógico — `SELECT n` — exclusivo de
  teste) precisará existir **antes** de qualquer rotina de limpeza
  destrutiva ser introduzida — não decidida aqui, fica para a ADR/
  tarefa que introduzir a primeira escrita real no Redis.

### 8. Subtarefas (Tarefa 3.3, ordem final)

Nenhum módulo de domínio é criado vazio — cada um entra no `AppModule`
exatamente na subtarefa em que seu Repository é criado de verdade:

1. **3.3.1 — `RuntimeConfigModule` + `RedisModule`/`RedisService` e
   testes offline**: cria `SERVER_CONFIG`/`RuntimeConfigModule` (§2.1);
   adiciona `ioredis@6.0.0`; implementa `RedisService` (§3, lifecycle
   completo); testes unitários offline (`vi.mock('ioredis')`,
   construção sem conectar). `AppModule` passa a importar
   `RuntimeConfigModule.forRoot(serverConfig)` e `RedisModule`.
2. **3.3.2 — `PrismaModule`/`PrismaService` e testes offline**: mesma
   estrutura, para Prisma (§2.2). `AppModule` passa a importar
   `PrismaModule`.
3. **3.3.3 — Composição offline do `AppModule` somente com módulos já
   funcionais**: novo teste de composição offline (§7.2), incluindo a
   prova de instância única — cobrindo exatamente
   `RuntimeConfigModule`+`PrismaModule`+`RedisModule`, já wired nas
   subtarefas 3.3.1–3.3.2. Os 34 testes existentes continuam verdes sem
   alteração.
4. **3.3.4 — Harness de infraestrutura real + primeiros testes reais**:
   cria `apps/api/test/infra/` (config, target
   `api:test:integration:infra`, script raiz `yarn validate:infra`,
   `TRUNCATE` guardado, execução serial — §7.5) e, no mesmo passo, os
   primeiros testes reais: `PrismaService` executando uma query real,
   `RedisService.ping()` real (§7.6 — só `connect`/`PING`, nenhuma
   escrita).
5. **3.3.5 — `UserRepository`/`UsersModule`**: implementação completa
   (§4.1) + testes offline (incluindo `ROLE_REQUIRED`/
   `DUPLICATE_ROLE_NAME`/`ROLE_NOT_FOUND`) + testes reais
   (`DUPLICATE_EMAIL`/`DUPLICATE_AUTH_IDENTITY`) + teste de contrato de
   `AgentLicense`. `AppModule` passa a importar `UsersModule` **nesta**
   subtarefa, não antes.
6. **3.3.6 — `WorkspaceRepository`/`WorkspacesModule`**:
   `createIndividualWorkspace` + `createBrokerageWorkspace` (ambos
   totalmente atômicos, §4.2) + `findById` + testes offline/reais
   (`OWNER_NOT_FOUND`, `AGENT_PROFILE_REQUIRED`,
   `DUPLICATE_WORKSPACE_SLUG`, FK composta `WorkspaceAgent` ↔
   `WorkspaceMembership`). `AppModule` passa a importar
   `WorkspacesModule` nesta subtarefa.
7. **3.3.7 — `PropertyRepository`/`PropertiesModule`**: `createProperty`
   - `findByIdInWorkspace` + `updatePropertyStatus` (§4.3) + testes
     offline/reais (`RESPONSIBLE_AGENT_NOT_ACTIVE`, a corrida do §6.1,
     `PROPERTY_ADDRESS_MISSING`, CAS) + testes de contrato restantes
     (§7.4). `AppModule` passa a importar `PropertiesModule` nesta
     subtarefa.
8. **3.3.8 — Validação integrada e fechamento posterior**:
   `yarn validate` **e** `yarn validate:infra` de ponta a ponta;
   documentação (`AGENTS.md`/`README.md`/roadmap) atualizada numa
   tarefa documental separada, só depois de revisão técnica.

Cada subtarefa continua exigindo autorização explícita e individual
antes de começar (AGENTS.md §3/§5).

## Consequências

**Positivas**:

- `RuntimeConfigModule` global + `PrismaModule`/`RedisModule` estáticos
  comuns elimina toda a complexidade de módulos-fábrica/compartilhamento
  de `DynamicModule` por referência da revisão anterior, sem abrir mão
  nem da instância única (garantida pela semântica padrão do Nest) nem
  da visibilidade explícita em cada módulo consumidor.
- Transações de `Workspace` totalmente atômicas removem a janela de
  corrida entre a checagem de pré-condição e a escrita que existia na
  revisão anterior.
- `roleNames` validado em três camadas (vazio → duplicata → existência
  no catálogo) dá mensagens de erro precisas sem nunca expor dados
  sensíveis.
- Tradução de erro por operação (não um `catch` genérico por código
  Prisma) evita rotular incorretamente um erro desconhecido como
  not-found/conflict.
- `RedisService` com timeouts finitos em toda operação (`connectTimeout`,
  `commandTimeout`, `maxRetriesPerRequest: 1`, timeout de shutdown)
  torna estruturalmente impossível `ping()`/`app.close()` travarem
  indefinidamente.

**Negativas / trade-offs aceitos**:

- Cada Repository precisa listar explicitamente qual constraint ele
  reconhece por call site (§5.1), em vez de um tratamento genérico —
  mais código por método, aceito pela precisão que ganha.
- `yarn validate:infra` continua exigindo Docker local, fora do hook
  `pre-commit`.
- Escopo dos repositories permanece sem `reassignResponsibleAgent`,
  transferência de titularidade, tradução de erro para Problem Details.

## Fora de escopo

- Qualquer Controller, Service, endpoint HTTP ou DTO de entrada/saída.
- Readiness real e seus testes HTTP — Tarefa 3.4, reaproveitando
  `PrismaService`/`RedisService.ping()`/`isReady()` desta ADR, incluindo
  o import explícito de `PrismaModule`/`RedisModule` em `HealthModule`.
- Dockerfile da API — Tarefa 3.5.
- Convites/gestão de membership além da criação inicial, transferência
  de titularidade de `Workspace`, `reassignResponsibleAgent`.
- Tradução de erros internos para Problem Details.
- `@nestjs/terminus` ou qualquer outro framework de health-check.
- RLS (row-level security).
- Extração de um pacote compartilhado (`libs/database`) para o Prisma
  Client entre `api` e um futuro `worker`.
- BullMQ em si (só a preparação de opções do `ioredis`, com a
  justificativa explícita de por que o worker **não** reutiliza esta
  configuração, §3.2) — Fase 4.
- Estratégia de namespace/banco Redis de teste para dados reais de
  cache/BullMQ — só decidida quando a primeira escrita real no Redis
  for introduzida (§7.6).

## Questões em aberto para aprovação

Nenhuma questão arquitetural de fundo permanece em aberto — todas as
decisões desta ADR (composição de módulos, lifecycle do Redis,
repositories e contratos, CAS e locks, catálogo de erros, antecipação
de `validate:infra`, as oito subtarefas, e a substituição pontual da
decisão de UUID raw de `Address` da ADR 006) foram explicitamente
aprovadas pelo responsável pelo projeto — ver `## Status` acima
(`Accepted`). Os únicos valores ainda ajustáveis sem exigir nova ADR
(parâmetros, não decisões estruturais): os três timeouts do Redis
(`connectTimeout`/`commandTimeout`/`REDIS_SHUTDOWN_TIMEOUT_MS`, todos
sugeridos em `2000`ms) e a curva de `retryStrategy` (sugerida
`min(tentativa × 200ms, 2000ms)`) — ajustáveis na implementação, desde
que a forma (timeouts finitos em toda operação, backoff limitado)
permaneça.
