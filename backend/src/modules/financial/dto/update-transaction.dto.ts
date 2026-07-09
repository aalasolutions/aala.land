import {
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsDateString,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  PAYMENT_METHOD_VALUES,
  TRANSACTION_STATUS_VALUES,
} from '../../../shared/taxonomies';

export class UpdateTransactionDto {
  @ApiPropertyOptional({ enum: TRANSACTION_STATUS_VALUES })
  @IsIn(TRANSACTION_STATUS_VALUES)
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ example: 15500 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  amount?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(100)
  @IsOptional()
  referenceNumber?: string;

  @ApiPropertyOptional({ enum: PAYMENT_METHOD_VALUES })
  @IsIn(PAYMENT_METHOD_VALUES)
  @IsOptional()
  paymentMethod?: string;

  @ApiPropertyOptional({ example: '2026-02-15' })
  @IsDateString()
  @IsOptional()
  dueDate?: string;
}
