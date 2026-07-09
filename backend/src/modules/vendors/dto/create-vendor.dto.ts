import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsIn,
  IsNumber,
  Min,
  Max,
  MaxLength,
  IsEmail,
  IsBoolean,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { VENDOR_SPECIALTY_VALUES } from '../../../shared/taxonomies';

export class CreateVendorDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @ApiProperty({
    enum: VENDOR_SPECIALTY_VALUES,
    default: 'GENERAL',
    required: false,
  })
  @IsOptional()
  @IsIn(VENDOR_SPECIALTY_VALUES)
  specialty?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  companyName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({ required: false, description: 'Rating from 0.00 to 5.00' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(5)
  rating?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  hourlyRate?: number;

  @ApiProperty({ required: false, default: 'AED' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({
    required: false,
    example: 'dubai',
    description: 'Region code for multi-region filtering',
  })
  @IsOptional()
  @IsString()
  regionCode?: string;
}
