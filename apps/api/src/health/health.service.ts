import { Injectable } from '@nestjs/common';
import { HealthLiveResponseDto } from './dto/health-live-response.dto';
import { HealthReadyResponseDto } from './dto/health-ready-response.dto';

/**
 * Fase 2: there is no persistence or external dependency yet, so readiness
 * can only report on the application itself. From Fase 3 onward, this
 * service starts checking PostgreSQL/PostGIS and Redis too (see
 * docs/TARGET_ARCHITECTURE.md, section 4) — no Repository exists here
 * because there is nothing to persist.
 */
@Injectable()
export class HealthService {
  checkLive(): HealthLiveResponseDto {
    return { status: 'ok' };
  }

  checkReady(): HealthReadyResponseDto {
    return { status: 'ok', checks: { application: 'up' } };
  }
}
