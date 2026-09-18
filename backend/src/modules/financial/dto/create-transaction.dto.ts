import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { IsDateOnly } from '@shared/decorators/is-date-only.decorator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  TransactionType,
  TransactionCategory,
  TransactionStatus,
  PaymentMethod,
} from '../entities/transaction.entity';

export class CreateTransactionDto {
  @ApiProperty({ enum: TransactionType, example: TransactionType.INCOME })
  @IsEnum(TransactionType)
  type: TransactionType;

  @ApiPropertyOptional({
    enum: TransactionCategory,
    example: TransactionCategory.RENT,
  })
  @IsEnum(TransactionCategory)
  @IsOptional()
  category?: TransactionCategory;

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

  @ApiPropertyOptional({ format: 'date', example: '2026-01-31' })
  @IsDateOnly()
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

  @ApiPropertyOptional({
    enum: TransactionStatus,
    default: TransactionStatus.PENDING,
  })
  @IsEnum(TransactionStatus)
  @IsOptional()
  status?: TransactionStatus;

  @ApiPropertyOptional({ enum: PaymentMethod, default: PaymentMethod.CASH })
  @IsEnum(PaymentMethod)
  @IsOptional()
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({ format: 'date', example: '2026-02-15' })
  @IsDateOnly()
  @IsOptional()
  dueDate?: string;
}
