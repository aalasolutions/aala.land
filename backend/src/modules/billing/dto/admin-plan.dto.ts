import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { BillingPlan } from '../provider/billing-provider.interface';

export class AdminCheckoutDto {
  @ApiProperty({ description: 'Company to start checkout for', format: 'uuid' })
  @IsUUID()
  companyId: string;

  @ApiProperty({
    description: 'Plan to subscribe to',
    enum: ['PRO', 'ENTERPRISE'],
  })
  @IsIn(['PRO', 'ENTERPRISE'])
  plan: BillingPlan;

  @ApiProperty({ description: 'Initial seat quantity', minimum: 1, example: 3 })
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiProperty({ description: 'Stripe-format success redirect URL' })
  @IsString()
  successUrl: string;

  @ApiProperty({ description: 'Stripe-format cancel redirect URL' })
  @IsString()
  cancelUrl: string;

  @ApiProperty({
    description:
      'Payment currency for the company; charged and pinned. Defaults to USD.',
    enum: ['usd', 'aed', 'sar'],
    required: false,
    default: 'usd',
  })
  @IsOptional()
  @IsIn(['usd', 'aed', 'sar'])
  currency?: string;
}

export class AdminChangePlanDto {
  @ApiProperty({ description: 'Company to switch plan for', format: 'uuid' })
  @IsUUID()
  companyId: string;

  @ApiProperty({ description: 'Target plan', enum: ['PRO', 'ENTERPRISE'] })
  @IsIn(['PRO', 'ENTERPRISE'])
  plan: BillingPlan;
}

export class AdminCancelDto {
  @ApiProperty({ description: 'Company to cancel for', format: 'uuid' })
  @IsUUID()
  companyId: string;
}
