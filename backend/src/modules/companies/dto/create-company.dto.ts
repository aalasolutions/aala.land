import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  Matches,
  MaxLength,
  Validate,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsValidRegionCode } from '../validators/is-valid-region-code.validator';

export class CreateCompanyDto {
  @ApiProperty({ example: 'Acme Real Estate' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiProperty({ example: 'acme-real-estate' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'slug must be lowercase letters, numbers and hyphens only',
  })
  slug: string;

  @ApiPropertyOptional({
    example: ['punjab', 'sindh'],
    description: 'Array of valid region codes',
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  activeRegions?: string[];

  @ApiProperty({
    example: 'punjab',
    description: 'Default region code, must be a valid region',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Validate(IsValidRegionCode)
  defaultRegionCode: string;
}
