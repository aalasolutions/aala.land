import {
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  IsDateString,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  PAYMENT_METHOD_VALUES,
  TRANSACTION_CATEGORY_VALUES,
  TRANSACTION_STATUS_VALUES,
  TRANSACTION_TYPE_VALUES,
} from '../../../shared/taxonomies';

export class CreateTransactionDto {
  @ApiProperty({ enum: TRANSACTION_TYPE_VALUES, example: 'INCOME' })
  @IsIn(TRANSACTION_TYPE_VALUES)
  type: string;

  @ApiPropertyOptional({ enum: TRANSACTION_CATEGORY_VALUES, example: 'RENT' })
  @IsIn(TRANSACTION_CATEGORY_VALUES)
  @IsOptional()
  category?: string;

  @ApiProperty({ example: 15000 })
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiPropertyOptional({ example: 'AED', default: 'AED' })
  @IsString()
  @MaxLength(3)
  @IsOptional()
  currency?: string;

  @ApiPropertyOptional({ example: 'Monthly rent payment January 2026' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: '2026-01-31' })
  @IsDateString()
  @IsOptional()
  transactionDate?: string;

  @ApiPropertyOptional({ example: 'REF-001' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  referenceNumber?: string;

  @ApiPropertyOptional({ example: 'uuid-of-unit' })
  @IsUUID()
  @IsOptional()
  unitId?: string;

  @ApiPropertyOptional({ enum: TRANSACTION_STATUS_VALUES, default: 'PENDING' })
  @IsIn(TRANSACTION_STATUS_VALUES)
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ enum: PAYMENT_METHOD_VALUES, default: 'CASH' })
  @IsIn(PAYMENT_METHOD_VALUES)
  @IsOptional()
  paymentMethod?: string;

  @ApiPropertyOptional({ example: '2026-02-15' })
  @IsDateString()
  @IsOptional()
  dueDate?: string;
}
