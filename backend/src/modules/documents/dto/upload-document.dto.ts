import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsEnum,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import {
  DocumentCategory,
  DocumentAccessLevel,
} from '../../properties/entities/property-document.entity';

export class UploadDocumentDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  fileType?: string;

  /**
   * Maps to PropertyDocument.unitId (DB column: unit_id).
   */
  @ApiProperty({ required: false })
  @Transform(({ value }) => value || undefined)
  @IsOptional()
  @IsUUID()
  unitId?: string;

  @ApiProperty({ required: false })
  @Transform(({ value }) => value || undefined)
  @IsOptional()
  @IsUUID()
  assetId?: string;

  @ApiProperty({
    enum: DocumentCategory,
    default: DocumentCategory.OTHER,
    required: false,
  })
  @IsOptional()
  @IsEnum(DocumentCategory)
  category?: DocumentCategory;

  @ApiProperty({
    enum: DocumentAccessLevel,
    default: DocumentAccessLevel.TEAM,
    required: false,
  })
  @IsOptional()
  @IsEnum(DocumentAccessLevel)
  accessLevel?: DocumentAccessLevel;

  @ApiProperty({
    required: false,
    description:
      'When omitted, the region of the linked property, otherwise company-wide for admins and the caller own region for everyone else',
  })
  @IsOptional()
  @IsString()
  regionCode?: string;
}
