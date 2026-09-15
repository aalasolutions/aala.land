import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  Min,
  IsDateString,
  MaxLength,
  IsUUID,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { ChequeStatus, ChequeType } from '../entities/cheque.entity';

export class UpdateChequeDto {
  @ApiProperty({ enum: ChequeStatus, required: false })
  @IsOptional()
  @IsEnum(ChequeStatus)
  status?: ChequeStatus;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
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
