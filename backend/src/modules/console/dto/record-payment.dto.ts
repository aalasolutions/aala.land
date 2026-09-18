import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { IsDateOnly } from '@shared/decorators/is-date-only.decorator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

// Multipart fields arrive as strings, hence Type() coercion; notes-or-receipt enforced in service.
export class RecordPaymentDto {
  @ApiProperty({
    description: 'Amount in MINOR units of the payment currency',
    minimum: 1,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amount: number;

  @ApiProperty({
    description: 'Lowercase ISO 4217; recorded as-is, no FX',
    example: 'pkr',
  })
  @IsString()
  @Matches(/^[a-zA-Z]{3}$/, { message: 'currency must be a 3-letter ISO code' })
  currency: string;

  @ApiProperty({
    description: 'Date the money was received',
    format: 'date',
    example: '2026-09-01',
  })
  @IsDateOnly()
  receivedAt: string;

  @ApiProperty({
    description: 'Start of the billing period this payment covers',
    format: 'date',
    example: '2026-09-01',
  })
  @IsDateOnly()
  coversStart: string;

  @ApiProperty({
    description: 'End of the billing period this payment covers',
    format: 'date',
    example: '2026-09-30',
  })
  @IsDateOnly()
  coversEnd: string;

  @ApiProperty({
    description: 'Free-text notes (e.g. "JazzCash transfer, txn 8842")',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
