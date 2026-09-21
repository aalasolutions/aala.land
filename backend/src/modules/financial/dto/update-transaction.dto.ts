import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { IsDateOnly } from '@shared/decorators/is-date-only.decorator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  TransactionStatus,
  PaymentMethod,
} from '../entities/transaction.entity';

export class UpdateTransactionDto {
  @ApiPropertyOptional({ enum: TransactionStatus })
  @IsEnum(TransactionStatus)
  @IsOptional()
  status?: TransactionStatus;

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

  @ApiPropertyOptional({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  @IsOptional()
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({ format: 'date', example: '2026-02-15' })
  @IsDateOnly()
  @IsOptional()
  dueDate?: string;

  @ApiPropertyOptional({
    format: 'date',
    example: '2026-02-15',
    description:
      'Accepted from 30 days before to 1 month after the region business day.',
  })
  @IsDateOnly()
  @IsOptional()
  transactionDate?: string;
}
