import { IsString, IsNotEmpty, IsOptional, IsUUID, IsEnum, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PropertyType } from '../entities/property-type.enum';

export class CreateBuildingDto {
  @ApiProperty({ example: 'Burj View Tower' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiProperty({ example: 'uuid-of-area' })
  @IsUUID()
  @IsNotEmpty()
  areaId: string;

  @ApiPropertyOptional({ example: '123 Sheikh Zayed Road, Dubai' })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiPropertyOptional({ enum: PropertyType, default: PropertyType.RENTAL })
  @IsEnum(PropertyType)
  @IsOptional()
  propertyType?: PropertyType;
}
