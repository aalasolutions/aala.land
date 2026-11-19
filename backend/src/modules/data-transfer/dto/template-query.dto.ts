import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

export enum TransferFormat {
  CSV = 'csv',
  XLSX = 'xlsx',
}

export class TemplateQueryDto {
  @ApiProperty({ required: false, enum: TransferFormat, default: 'csv' })
  @IsOptional()
  @IsEnum(TransferFormat)
  format: TransferFormat = TransferFormat.CSV;
}
