import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import type {
  RemedyKind,
  RemedyScope,
  RemedySource,
} from '../entities/payment-remedy.entity';

/**
 * "Make it right" (design section 7): always anchored to one real payment.
 * Cross-field rules (scope/amount requiredness) enforced in the service.
 */
export class ApplyRemedyDto {
  @ApiProperty({
    enum: ['card', 'manual'],
    description: 'Which ledger the anchored payment lives in',
  })
  @IsIn(['card', 'manual'])
  source: RemedySource;

  @ApiProperty({
    format: 'uuid',
    description: 'billing_history id (card) or manual_payments id (manual)',
  })
  @IsUUID()
  paymentId: string;

  @ApiProperty({ enum: ['discount_next_bill', 'refund'] })
  @IsIn(['discount_next_bill', 'refund'])
  remedy: RemedyKind;

  @ApiProperty({
    enum: ['partial', 'full'],
    required: false,
    description: 'Required when remedy is refund',
  })
  @IsOptional()
  @IsIn(['partial', 'full'])
  scope?: RemedyScope;

  @ApiProperty({
    description:
      'MINOR units in the payment currency. Required for discount and partial refund; forbidden for full refund.',
    required: false,
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  amount?: number;

  @ApiProperty({
    description: 'Why we are making it right (lands in the History tab)',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  whyNote: string;
}
