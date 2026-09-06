import { ApiProperty } from '@nestjs/swagger';

export class HealthReadyChecksDto {
  @ApiProperty({ enum: ['up'], example: 'up' })
  application!: 'up';
}

export class HealthReadyResponseDto {
  @ApiProperty({ enum: ['ok'], example: 'ok' })
  status!: 'ok';

  @ApiProperty({ type: HealthReadyChecksDto })
  checks!: HealthReadyChecksDto;
}
