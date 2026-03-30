import { IsString, IsOptional, IsBoolean, IsArray, MaxLength, Validate } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsValidRegionCode } from '../validators/is-valid-region-code.validator';

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

  @ApiPropertyOptional({ example: ['punjab', 'sindh'], description: 'Array of valid region codes' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  activeRegions?: string[];

  @ApiPropertyOptional({ example: 'punjab', description: 'Default region code, must be a valid region if provided' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  @Validate(IsValidRegionCode)
  defaultRegionCode?: string;
}
