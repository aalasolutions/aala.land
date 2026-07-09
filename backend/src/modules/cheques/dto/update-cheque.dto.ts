import {
  IsString,
  IsOptional,
  IsEnum,
  IsIn,
  IsNumber,
  Min,
  IsDateString,
  MaxLength,
  IsUUID,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import {
  CHEQUE_STATUS_VALUES,
  CHEQUE_TYPE_VALUES,
} from '../../../shared/taxonomies';

export class UpdateChequeDto {
  @ApiProperty({ enum: CHEQUE_STATUS_VALUES, required: false })
  @IsOptional()
  @IsIn(CHEQUE_STATUS_VALUES)
  status?: string;

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

  @ApiProperty({ enum: CHEQUE_TYPE_VALUES, required: false })
  @IsOptional()
  @IsIn(CHEQUE_TYPE_VALUES)
  type?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}
