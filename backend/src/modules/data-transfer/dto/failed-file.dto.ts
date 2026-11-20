import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { IMPORT_MAX_ROWS } from '../import-validation';

export class FailedRowDto {
  @ApiProperty({ description: 'Uploaded cell values keyed by column key' })
  @IsObject()
  values: Record<string, string | undefined>;

  @ApiProperty()
  @IsString()
  @MaxLength(500)
  reason: string;

  @ApiProperty({
    required: false,
    description: 'Header of the column the reason is about',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  column?: string;
}

export class FailedFileBodyDto {
  @ApiProperty({ type: [FailedRowDto] })
  @IsArray()
  @ArrayMaxSize(IMPORT_MAX_ROWS)
  @ValidateNested({ each: true })
  @Type(() => FailedRowDto)
  rows: FailedRowDto[];
}
