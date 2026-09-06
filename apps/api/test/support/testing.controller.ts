import {
  Body,
  Controller,
  Get,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ValidationTestDto } from './dto/validation-test.dto';

/**
 * Test-only routes used exclusively by the integration suite to exercise
 * error paths (validation, throttling, 500, 503) without depending on real
 * domain endpoints. This lives entirely under apps/api/test — it is never
 * imported by AppModule and never compiled into dist/apps/api. Only a test
 * harness that explicitly imports TestingModule (see
 * apps/api/test/support/create-test-app.ts) mounts these routes.
 * @ApiExcludeController is kept as a second, independent safeguard in case
 * it were ever wired in by mistake.
 */
@ApiExcludeController()
@Controller('__test__')
export class TestingController {
  @Post('validation')
  validation(@Body() body: ValidationTestDto): ValidationTestDto {
    return body;
  }

  @Get('throttled')
  @Throttle({ default: { limit: 2, ttl: 2000 } })
  throttled(): { ok: true } {
    return { ok: true };
  }

  @Get('boom')
  boom(): never {
    throw new Error('boom: simulated unexpected failure');
  }

  @Get('unavailable')
  unavailable(): never {
    throw new ServiceUnavailableException('Simulated dependency outage');
  }
}
