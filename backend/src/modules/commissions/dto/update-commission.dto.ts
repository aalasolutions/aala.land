import { IsString, IsOptional, IsEnum, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { CommissionStatus } from '../entities/commission.entity';

export class UpdateCommissionDto {
  @ApiProperty({
    enum: CommissionStatus,
    required: false,
    description:
      'Only CANCELLED (from PENDING or APPROVED) or PENDING (from APPROVED). Use approve and pay to move forward.',
  })
  @IsOptional()
  @IsEnum(CommissionStatus)
  status?: CommissionStatus;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({
    required: false,
    maxLength: 500,
    description: 'Required when the new status is CANCELLED',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(500)
  reason?: string;
}
