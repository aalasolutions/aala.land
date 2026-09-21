import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class QueryReportsDto {
  // Injected by RegionScopeInterceptor; must be whitelisted or forbidNonWhitelisted rejects it
  @ApiProperty({
    required: false,
    maxLength: 50,
    description:
      'Applied for region-scoped roles only. Admins read every region.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  regionCode?: string;
}
