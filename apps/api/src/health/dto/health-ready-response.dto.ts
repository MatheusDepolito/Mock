import { ApiProperty } from '@nestjs/swagger';

export class HealthReadyChecksDto {
  @ApiProperty({ enum: ['up'], example: 'up' })
  application!: 'up';

  /** Confirms both PostgreSQL and the PostGIS extension are usable. */
  @ApiProperty({ enum: ['up'], example: 'up' })
  database!: 'up';

  @ApiProperty({ enum: ['up'], example: 'up' })
  redis!: 'up';
}

export class HealthReadyResponseDto {
  @ApiProperty({ enum: ['ok'], example: 'ok' })
  status!: 'ok';

  @ApiProperty({ type: HealthReadyChecksDto })
  checks!: HealthReadyChecksDto;
}
