import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import type { BillingPriceKind } from '@modules/billing/provider/billing-provider.interface';

export const MAX_UNIT_AMOUNT = 100_000_000;

export class ChangePriceAmountDto {
  @ApiProperty({
    description: 'Monthly amount in MINOR units of the price currency',
    minimum: 1,
    maximum: MAX_UNIT_AMOUNT,
  })
  @IsInt()
  @Min(1)
  @Max(MAX_UNIT_AMOUNT, {
    message: 'unitAmount must be at most 100000000 minor units',
  })
  unitAmount: number;

  @ApiProperty({
    description:
      'Base prices only: true (the default) when the amount includes tax, false when tax is added on top',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  taxInclusive?: boolean;
}

// Provider currency and country rules and overlap checks are enforced in the service.
export class CreatePriceDto extends ChangePriceAmountDto {
  @ApiProperty({ enum: ['SEAT', 'ENTERPRISE_BASE'] })
  @IsIn(['SEAT', 'ENTERPRISE_BASE'])
  kind: BillingPriceKind;

  @ApiProperty({ description: 'ISO 4217, stored lowercase', example: 'usd' })
  @IsString()
  @Matches(/^[a-zA-Z]{3}$/, { message: 'currency must be a 3-letter ISO code' })
  currency: string;

  @ApiProperty({
    description:
      'ISO 3166-1 alpha-2 codes; omit for the base price, set for a custom price',
    required: false,
    example: ['PK'],
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(250)
  @Matches(/^[a-zA-Z]{2}$/, {
    each: true,
    message: 'each country code must be a 2-letter code',
  })
  countryCodes?: string[];
}
