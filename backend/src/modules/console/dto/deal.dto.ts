import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import type { DealBasis } from '../entities/custom-deal.entity';

// untilDate/lifetime required, enforced in the service; an edit is a full re-statement of the deal.
export class GrantDealDto {
  @ApiProperty({
    description:
      'Price in MINOR units of the deal currency (PKR 1000 = 100000). Zero is legal (free deals exist).',
    minimum: 0,
  })
  @IsInt()
  @Min(0)
  priceAmount: number;

  @ApiProperty({
    description: 'Lowercase ISO 4217, any currency',
    example: 'pkr',
  })
  @IsString()
  @Matches(/^[a-zA-Z]{3}$/, { message: 'currency must be a 3-letter ISO code' })
  currency: string;

  @ApiProperty({ enum: ['per_seat', 'total_month'] })
  @IsIn(['per_seat', 'total_month'])
  basis: DealBasis;

  @ApiProperty({
    description: 'Seat cap; every deal carries one',
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  seatCap: number;

  @ApiProperty({
    description: 'Expiry date (ISO). Omit when lifetime is true.',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  untilDate?: string;

  @ApiProperty({ description: 'Lifetime deal (no expiry)', required: false })
  @IsOptional()
  @IsBoolean()
  lifetime?: boolean;

  @ApiProperty({
    description:
      'Why this company pays what it pays (required deal memory)',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  whyNote: string;
}
