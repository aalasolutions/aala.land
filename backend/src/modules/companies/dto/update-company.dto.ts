import { IsString, IsOptional, IsBoolean, IsArray, MaxLength, Validate, IsInt, Min, IsDateString, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsValidRegionCode } from '../validators/is-valid-region-code.validator';
import { SubscriptionTier } from '../entities/company.entity';

export class UpdateCompanyDto {
  @ApiPropertyOptional({ example: 'Acme Real Estate Updated' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({ example: ['punjab', 'sindh'], description: 'Array of valid region codes' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  activeRegions?: string[];

  @ApiPropertyOptional({ example: 'punjab', description: 'Default region code, must be a valid region if provided' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  @Validate(IsValidRegionCode)
  defaultRegionCode?: string;

  @ApiPropertyOptional({ example: 'STARTER', enum: SubscriptionTier })
  @IsEnum(SubscriptionTier)
  @IsOptional()
  subscriptionTier?: SubscriptionTier;

  @ApiPropertyOptional({ example: 5 })
  @IsInt()
  @Min(1)
  @IsOptional()
  maxUsers?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsInt()
  @Min(1)
  @IsOptional()
  maxCountries?: number;

  @ApiPropertyOptional({ example: 100 })
  @IsInt()
  @Min(1)
  @IsOptional()
  maxProperties?: number;

  @ApiPropertyOptional({ example: '2026-12-31T00:00:00Z' })
  @IsDateString()
  @IsOptional()
  subscriptionExpiresAt?: string | null;
}
