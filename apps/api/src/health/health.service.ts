import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { HealthLiveResponseDto } from './dto/health-live-response.dto';
import { HealthReadyResponseDto } from './dto/health-ready-response.dto';

// Same order of magnitude as RedisService's own timeouts (2000ms). See
// docs/adr/008-runtime-persistence-and-repositories.md and the Tarefa 3.4
// plan for the evidence behind each one.
const DB_PROBE_MAX_WAIT_MS = 1000;
const DB_PROBE_STATEMENT_TIMEOUT_MS = 1000;
const DB_PROBE_TX_TIMEOUT_MS = 3000;

/**
 * Readiness checks PostgreSQL/PostGIS and Redis directly through
 * PrismaService/RedisService — no Repository exists here because there is
 * nothing to persist (see docs/adr/008-runtime-persistence-and-repositories.md
 * §2.4 and docs/adr/006-persistence-and-local-infrastructure.md). Liveness
 * never depends on either dependency.
 */
@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  checkLive(): HealthLiveResponseDto {
    return { status: 'ok' };
  }

  async checkReady(): Promise<HealthReadyResponseDto> {
    const [database, redis] = await Promise.allSettled([
      this.probeDatabase(),
      this.redis.ping(),
    ]);

    const databaseFailed = database.status === 'rejected';
    const redisFailed = redis.status === 'rejected';

    // Only the logical check name is logged — never `reason`/`cause`, a
    // message, or a driver stack, which could embed a connection string or
    // credentials. Same pattern as RedisService's own error listener.
    if (databaseFailed) {
      this.logger.warn('Readiness probe failed', { check: 'database' });
    }
    if (redisFailed) {
      this.logger.warn('Readiness probe failed', { check: 'redis' });
    }

    if (databaseFailed && redisFailed) {
      throw new ServiceUnavailableException(
        'PostgreSQL and Redis are not ready.',
      );
    }
    if (databaseFailed) {
      throw new ServiceUnavailableException('PostgreSQL is not ready.');
    }
    if (redisFailed) {
      throw new ServiceUnavailableException('Redis is not ready.');
    }

    return {
      status: 'ok',
      checks: { application: 'up', database: 'up', redis: 'up' },
    };
  }

  /**
   * `SET LOCAL statement_timeout = ...` can't be parameterized (`SET x =
   * $1` is invalid PostgreSQL syntax), so the timeout is applied through
   * `set_config(...)` instead — a regular function, callable from
   * `$queryRaw` like any other, whose third argument (`true`, `is_local`)
   * has the exact same transaction-scoped semantics as `SET LOCAL`: it
   * never leaks onto another request's query on the same pooled
   * connection. This is a real, server-enforced bound on the query itself
   * — `$transaction`'s own `maxWait`/`timeout` only bound how long this
   * method's caller waits (both are internally a `Promise.race`); neither
   * cancels a pending connection attempt or a running statement on its
   * own. The physical-connection-acquisition phase has no effective bound
   * in this configuration (accepted residual gap for this task — see the
   * Tarefa 3.4 plan).
   */
  private async probeDatabase(): Promise<void> {
    const [row] = await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT set_config('statement_timeout', ${String(DB_PROBE_STATEMENT_TIMEOUT_MS)}::text, true)`;
        return tx.$queryRaw<{ postgisVersion: string | null }[]>`
          SELECT PostGIS_Version() AS "postgisVersion"
        `;
      },
      { maxWait: DB_PROBE_MAX_WAIT_MS, timeout: DB_PROBE_TX_TIMEOUT_MS },
    );

    if (
      typeof row?.postgisVersion !== 'string' ||
      row.postgisVersion.trim().length === 0
    ) {
      throw new Error('PostGIS_Version() returned no usable result.');
    }
  }
}
