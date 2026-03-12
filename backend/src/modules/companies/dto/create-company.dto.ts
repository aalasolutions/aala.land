import { IsString, IsNotEmpty, IsOptional, IsArray, Matches, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCompanyDto {
  @ApiProperty({ example: 'Acme Real Estate' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiProperty({ example: 'acme-real-estate' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(/^[a-z0-9-]+$/, { message: 'slug must be lowercase letters, numbers and hyphens only' })
  slug: string;

  @ApiPropertyOptional({ example: ['dubai', 'abu-dhabi'], description: 'Array of region codes from MENA_REGIONS' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  activeRegions?: string[];

  @ApiPropertyOptional({ example: 'dubai', description: 'Default region code, must be in activeRegions' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  defaultRegionCode?: string;
}
