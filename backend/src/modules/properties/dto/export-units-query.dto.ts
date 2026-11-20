import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsIn,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import type { SpreadsheetFormat } from '@shared/spreadsheet/column-def';
import { UnitStatus } from '../entities/unit.entity';
import { PropertyType } from '../entities/property-type.enum';
import { UnitArchivedFilter } from './unit-archived-filter.enum';

export const EXPORT_FORMATS: readonly SpreadsheetFormat[] = ['csv', 'xlsx'];

// Same query shape as GET /properties/units minus paging and sort, plus format; the RegionScopeInterceptor writes regionCode here too.
export class ExportUnitsQueryDto {
  @ApiPropertyOptional({ enum: EXPORT_FORMATS, default: 'csv' })
  @IsOptional()
  @IsIn(EXPORT_FORMATS)
  format: SpreadsheetFormat = 'csv';

  @ApiPropertyOptional({ description: 'Comma-separated amenity keys' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  amenities?: string;

  @ApiPropertyOptional({ enum: PropertyType })
  @IsOptional()
  @IsEnum(PropertyType)
  propertyType?: PropertyType;

  @ApiPropertyOptional({ enum: UnitStatus })
  @IsOptional()
  @IsEnum(UnitStatus)
  status?: UnitStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumberString()
  minPrice?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumberString()
  maxPrice?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumberString()
  minBeds?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumberString()
  maxBeds?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  localityId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  regionCode?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @ApiPropertyOptional({ enum: UnitArchivedFilter })
  @IsOptional()
  @IsEnum(UnitArchivedFilter)
  archived?: UnitArchivedFilter;
}
