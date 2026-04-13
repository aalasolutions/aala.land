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

  @ApiPropertyOptional({ enum: PropertyType, description: 'Overrides asset default. Null = inherit from asset' })
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

  @ApiPropertyOptional({ example: 'Spacious 2-bedroom with marina views' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: '10' })
  @IsString()
  @IsOptional()
  floor?: string;

  @ApiPropertyOptional({ example: [], description: 'Array of photo URLs' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  photos?: string[];
}
