import { IsEnum, IsIn, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ACTIVITY_TYPE_VALUES } from '../../../shared/taxonomies';

export class CreateLeadActivityDto {
  @ApiProperty({ enum: ACTIVITY_TYPE_VALUES, example: 'NOTE' })
  @IsIn(ACTIVITY_TYPE_VALUES)
  type: string;

  @ApiPropertyOptional({
    example: 'Called the lead, they are interested in 2BR apartments',
  })
  @IsString()
  @IsOptional()
  notes?: string;
}
