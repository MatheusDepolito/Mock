/**
 * Injection token for `WorkerConfig` — the same `WorkerConfig` object
 * loaded and validated once by `main.ts` (or a test harness), never
 * re-validated or transformed here. Provided application-wide by
 * `RuntimeConfigModule` (see `runtime-config.module.ts`).
 *
 * Deliberately a separate token/type from the API's `SERVER_CONFIG`
 * (`apps/api/src/common/server-config.token.ts`) — the worker never
 * imports anything from `apps/api/src/**`, per
 * docs/TARGET_ARCHITECTURE.md, section 2 ("Worker separado"), and
 * docs/adr/006-persistence-and-local-infrastructure.md ("Prisma Client e
 * fronteira com o worker").
 */
export const WORKER_CONFIG = Symbol('WORKER_CONFIG');
