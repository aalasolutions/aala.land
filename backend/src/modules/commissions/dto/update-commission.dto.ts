import { IsString, IsOptional, IsEnum, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { COMMISSION_STATUS_VALUES } from '../../../shared/taxonomies';

export class UpdateCommissionDto {
  @ApiProperty({ enum: COMMISSION_STATUS_VALUES, required: false })
  @IsOptional()
  @IsIn(COMMISSION_STATUS_VALUES)
  status?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}
