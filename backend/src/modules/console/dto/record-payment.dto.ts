import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Manual-rail payment record (requirement 2.4). Multipart form: fields arrive
 * as strings, hence the Type() coercion. The receipt image travels as the
 * multipart "receipt" file field. At least one of notes/receipt is required
 * ("DOCUMENT IT"), enforced in the service where the file is visible.
 */
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

  @ApiProperty({ description: 'Date the money was received (ISO date)' })
  @IsDateString()
  receivedAt: string;

  @ApiProperty({
    description: 'Start of the billing period this payment covers',
  })
  @IsDateString()
  coversStart: string;

  @ApiProperty({ description: 'End of the billing period this payment covers' })
  @IsDateString()
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
