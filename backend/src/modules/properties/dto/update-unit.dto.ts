import {
  IsString,
  IsOptional,
  IsEnum,
  IsIn,
  IsNumber,
  IsInt,
  IsArray,
  Min,
  MaxLength,
  IsUUID,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  PROPERTY_TYPE_VALUES,
  UNIT_STATUS_VALUES,
} from '../../../shared/taxonomies';

export class UpdateUnitDto {
  @ApiPropertyOptional({ example: '1B' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  unitNumber?: string;

  @ApiPropertyOptional({ example: 'uuid-of-owner', nullable: true })
  @IsUUID()
  @IsOptional()
  ownerId?: string | null;

  @ApiPropertyOptional({ enum: UNIT_STATUS_VALUES })
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
