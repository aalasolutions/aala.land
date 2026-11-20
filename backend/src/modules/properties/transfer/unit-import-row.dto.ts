import {
  IsArray,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { IsHalfStep } from '@shared/decorators/is-half-step.decorator';
import { MAX_BATHROOMS, UnitStatus } from '../entities/unit.entity';
import { PropertyType } from '../entities/property-type.enum';
import { UnitSubType } from '../entities/unit-sub-type.enum';

// One parsed row of the units sheet; names stand in for the ids CreateUnitDto carries.
export class UnitImportRowDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  city: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  locality: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  asset: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  unitNumber: string;

  @IsEnum(UnitSubType)
  subType: UnitSubType;

  @IsEnum(UnitStatus)
  @IsOptional()
  status?: UnitStatus;

  @IsEnum(PropertyType)
  @IsOptional()
  propertyType?: PropertyType;

  @IsNumber()
  @Min(0)
  @IsOptional()
  price?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  sqFt?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  bedrooms?: number;

  @IsNumber()
  @IsHalfStep()
  @Min(0)
  @Max(MAX_BATHROOMS)
  @IsOptional()
  bathrooms?: number;

  @IsString()
  @MaxLength(20)
  @IsOptional()
  floor?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  amenities?: string[];

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @MaxLength(100)
  @IsOptional()
  ownerFirstName?: string;

  @IsString()
  @MaxLength(100)
  @IsOptional()
  ownerLastName?: string;

  @IsString()
  @MaxLength(50)
  @IsOptional()
  ownerPhone?: string;

  @IsEmail()
  @MaxLength(255)
  @IsOptional()
  ownerEmail?: string;
}
