import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { CONTACT_TAGS } from '../contacts.service';
import type { SpreadsheetFormat } from '@shared/spreadsheet/column-def';

export const EXPORT_FORMATS: readonly SpreadsheetFormat[] = ['csv', 'xlsx'];

const FLAGS = ['true', 'false'] as const;

// Same query shape as the list, plus format; the RegionScopeInterceptor writes regionCode here too.
export class ExportContactsQueryDto {
  @ApiPropertyOptional({ enum: EXPORT_FORMATS, default: 'csv' })
  @IsOptional()
  @IsIn(EXPORT_FORMATS)
  format: SpreadsheetFormat = 'csv';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({ enum: CONTACT_TAGS })
  @IsOptional()
  @IsIn(CONTACT_TAGS)
  tag?: (typeof CONTACT_TAGS)[number];

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  agentId?: string;

  @ApiPropertyOptional({ enum: FLAGS })
  @IsOptional()
  @IsIn(FLAGS)
  isWhatsapp?: (typeof FLAGS)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  company?: string;

  @ApiPropertyOptional({ enum: FLAGS })
  @IsOptional()
  @IsIn(FLAGS)
  companyExact?: (typeof FLAGS)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  nationality?: string;

  @ApiPropertyOptional({ description: 'ISO date or instant, inclusive' })
  @IsOptional()
  @IsISO8601()
  dateFrom?: string;

  @ApiPropertyOptional({
    description: 'ISO date or instant, exclusive upper bound',
  })
  @IsOptional()
  @IsISO8601()
  dateTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  regionCode?: string;

  @ApiPropertyOptional({ enum: FLAGS })
  @IsOptional()
  @IsIn(FLAGS)
  allRegions?: (typeof FLAGS)[number];
}
