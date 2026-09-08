/**
 * Injection token for `ServerConfig` — the same `ServerConfig` object
 * loaded and validated once by `main.ts` (or a test harness), never
 * re-validated or transformed here. Provided application-wide by
 * `RuntimeConfigModule` (see `runtime-config.module.ts`), the only
 * global module in this codebase besides Nest's own `ConfigModule`. See
 * docs/adr/008-runtime-persistence-and-repositories.md (§2.1).
 *
 * Lives in its own file, separate from `RuntimeConfigModule` and from
 * `AppModule`, so any provider that needs to inject it (e.g.
 * `PrismaService`, `RedisService`) can do so without importing
 * `app/app.module.ts` — avoiding a reverse dependency from a leaf
 * module back into the application root.
 */
export const SERVER_CONFIG = Symbol('SERVER_CONFIG');
