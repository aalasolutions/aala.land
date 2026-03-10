import { IsString, IsOptional, IsEnum, IsNumber, IsInt, IsArray, Min, MaxLength, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { UnitStatus } from '../entities/unit.entity';
import { PropertyType } from '../entities/property-type.enum';

export class UpdateUnitDto {
  @ApiPropertyOptional({ example: '1B' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  unitNumber?: string;

  @ApiPropertyOptional({ example: 'uuid-of-owner' })
  @IsUUID()
  @IsOptional()
  ownerId?: string;

  @ApiPropertyOptional({ enum: UnitStatus })
  @IsEnum(UnitStatus)
  @IsOptional()
  status?: UnitStatus;

  @ApiPropertyOptional({ enum: PropertyType, description: 'Overrides building default. Null = inherit from building' })
  @IsEnum(PropertyType)
  @IsOptional()
  propertyType?: PropertyType;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  price?: number;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  sqFt?: number;

  @ApiPropertyOptional()
  @IsInt()
  @Min(0)
  @IsOptional()
  bedrooms?: number;

  @ApiPropertyOptional()
  @IsInt()
  @Min(0)
  @IsOptional()
  bathrooms?: number;

  @ApiPropertyOptional({ example: ['free_parking', 'gym', 'pool'], description: 'List of amenity keys' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  amenities?: string[];
}
