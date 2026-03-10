import { IsString, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CommissionStatus } from '../entities/commission.entity';

export class UpdateCommissionDto {
  @ApiProperty({ enum: CommissionStatus, required: false })
  @IsOptional()
  @IsEnum(CommissionStatus)
  status?: CommissionStatus;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}
