import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ActivityType } from '../entities/lead-activity.entity';

export class CreateLeadActivityDto {
  @ApiProperty({ enum: ActivityType, example: ActivityType.NOTE })
  @IsEnum(ActivityType)
  type: ActivityType;

  @ApiPropertyOptional({ example: 'Called the lead, they are interested in 2BR apartments' })
  @IsString()
  @IsOptional()
  notes?: string;
}
