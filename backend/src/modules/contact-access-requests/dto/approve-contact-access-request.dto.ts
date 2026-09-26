import { IsBoolean, IsISO8601, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ApproveContactAccessRequestDto {
  @ApiPropertyOptional({
    description:
      'ISO date the grant ends; omitted with forever unset means 90 days from now',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  expiresAt?: string;

  @ApiPropertyOptional({ type: Boolean, description: 'Grant never expires' })
  @IsOptional()
  @IsBoolean()
  forever?: boolean;
}
