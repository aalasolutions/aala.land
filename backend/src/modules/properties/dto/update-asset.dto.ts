import { IsString, IsOptional, IsEnum, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PropertyType } from '../entities/property-type.enum';

export class UpdateAssetDto {
  @ApiPropertyOptional({ example: 'Bay Tower Updated' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  address?: string;

  @ApiPropertyOptional({ enum: PropertyType })
  @IsEnum(PropertyType)
  @IsOptional()
  propertyType?: PropertyType;
}
