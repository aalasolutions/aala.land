import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsEnum,
  IsIn,
  IsNumber,
  IsInt,
  IsArray,
  Min,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  PROPERTY_TYPE_VALUES,
  UNIT_STATUS_VALUES,
} from '../../../shared/taxonomies';

export class CreateUnitDto {
  @ApiProperty({ example: '1A' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  unitNumber: string;

  @ApiProperty({ example: 'uuid-of-asset' })
  @IsUUID()
  @IsNotEmpty()
  assetId: string;

  @ApiPropertyOptional({ example: 'uuid-of-owner' })
  @IsUUID()
  @IsOptional()
  ownerId?: string;

  @ApiPropertyOptional({ enum: UNIT_STATUS_VALUES, default: 'available' })
  @IsIn(UNIT_STATUS_VALUES)
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({
    enum: PROPERTY_TYPE_VALUES,
    description: 'Overrides asset default. Null = not listed',
  })
  @IsIn(PROPERTY_TYPE_VALUES)
  @IsOptional()
  propertyType?: string;

  @ApiPropertyOptional({ example: 150000 })
  @IsNumber()
  @IsOptional()
  price?: number;

  @ApiPropertyOptional({ example: 850.5 })
  @IsNumber()
  @IsOptional()
  sqFt?: number;

  @ApiPropertyOptional({ example: 2 })
  @IsInt()
  @Min(0)
  @IsOptional()
  bedrooms?: number;

  @ApiPropertyOptional({ example: 2 })
  @IsInt()
  @Min(0)
  @IsOptional()
  bathrooms?: number;

  @ApiPropertyOptional({
    example: ['free_parking', 'gym', 'pool'],
    description: 'List of amenity keys',
  })
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
