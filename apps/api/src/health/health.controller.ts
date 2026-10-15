import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiProblemResponse } from '../common/api-problem-response.decorator';
import {
  ApiRequestIdHeader,
  REQUEST_ID_RESPONSE_HEADERS,
} from '../common/api-request-id.decorator';
import { HealthService } from './health.service';
import { HealthLiveResponseDto } from './dto/health-live-response.dto';
import { HealthReadyResponseDto } from './dto/health-ready-response.dto';

@ApiTags('health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('live')
  @ApiOperation({
    operationId: 'health_live',
    summary: 'Liveness probe (process is up; checks no dependency)',
  })
  @ApiRequestIdHeader()
  @ApiOkResponse({
    type: HealthLiveResponseDto,
    headers: REQUEST_ID_RESPONSE_HEADERS,
  })
  @ApiProblemResponse(500, 'Unexpected error (INTERNAL_SERVER_ERROR).')
  live(): HealthLiveResponseDto {
    return this.healthService.checkLive();
  }

  @Get('ready')
  @ApiOperation({
    operationId: 'health_ready',
    summary: 'Readiness probe (PostgreSQL/PostGIS and Redis are usable)',
  })
  @ApiRequestIdHeader()
  @ApiOkResponse({
    type: HealthReadyResponseDto,
    headers: REQUEST_ID_RESPONSE_HEADERS,
  })
  @ApiProblemResponse(
    503,
    'A required dependency is not ready (SERVICE_UNAVAILABLE). No `checks` field; `detail` is a static message naming the failed dependency (PostgreSQL, Redis, or both).',
  )
  @ApiProblemResponse(500, 'Unexpected error (INTERNAL_SERVER_ERROR).')
  async ready(): Promise<HealthReadyResponseDto> {
    return this.healthService.checkReady();
  }
}
