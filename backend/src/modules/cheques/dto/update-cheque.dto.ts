import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  Min,
  MaxLength,
  IsUUID,
} from 'class-validator';
import { IsDateOnly } from '@shared/decorators/is-date-only.decorator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { ChequeStatus, ChequeType } from '../entities/cheque.entity';

export class UpdateChequeDto {
  @ApiProperty({ enum: ChequeStatus, required: false })
  @IsOptional()
  @IsEnum(ChequeStatus)
  status?: ChequeStatus;

  @ApiProperty({ required: false, format: 'date', example: '2026-02-15' })
  @IsOptional()
  @IsDateOnly()
  dueDate?: string;

  @ApiProperty({ required: false, format: 'date', example: '2026-02-15' })
  @IsOptional()
  @IsDateOnly()
  depositDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  chequeNumber?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  bankName?: string;

  @ApiProperty({
    required: false,
    description: 'Link cheque to a property unit',
  })
  @IsOptional()
  @IsUUID()
  unitId?: string;

  @ApiProperty({ enum: ChequeType, required: false })
  @IsOptional()
  @IsEnum(ChequeType)
  type?: ChequeType;

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
