import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsObject,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { IMPORT_MAX_ROWS } from '../import-validation';

export class NoteRowDto {
  @ApiProperty({ description: 'Cell values keyed by the note column key' })
  @IsObject()
  values: Record<string, string | undefined>;

  @ApiProperty()
  @IsString()
  @MaxLength(500)
  reason: string;
}

export class NotesFileBodyDto {
  @ApiProperty({ type: [NoteRowDto] })
  @IsArray()
  @ArrayMaxSize(IMPORT_MAX_ROWS)
  @ValidateNested({ each: true })
  @Type(() => NoteRowDto)
  rows: NoteRowDto[];
}
