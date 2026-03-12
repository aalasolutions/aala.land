import { IsString, IsOptional, IsBoolean, IsArray, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

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
