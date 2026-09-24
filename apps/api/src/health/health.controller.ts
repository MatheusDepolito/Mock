import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { HealthService } from './health.service';
import { HealthLiveResponseDto } from './dto/health-live-response.dto';
import { HealthReadyResponseDto } from './dto/health-ready-response.dto';

@ApiTags('health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('live')
  @ApiOkResponse({ type: HealthLiveResponseDto })
  live(): HealthLiveResponseDto {
    return this.healthService.checkLive();
  }

  @Get('ready')
  @ApiOkResponse({ type: HealthReadyResponseDto })
  async ready(): Promise<HealthReadyResponseDto> {
    return this.healthService.checkReady();
  }
}
