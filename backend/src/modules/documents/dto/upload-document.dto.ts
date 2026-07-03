import { IsString, IsNotEmpty, IsOptional, IsUUID, IsEnum, MaxLength } from 'class-validator';
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

  /**
   * Maps to PropertyDocument.assetId (DB column: building_id). Intentional legacy naming.
   */
  @ApiProperty({ required: false })
  @Transform(({ value }) => value || undefined)
  @IsOptional()
  @IsUUID()
  assetId?: string;

  @ApiProperty({ enum: DocumentCategory, default: DocumentCategory.OTHER, required: false })
  @IsOptional()
  @IsEnum(DocumentCategory)
  category?: DocumentCategory;

  @ApiProperty({
    enum: DocumentAccessLevel,
    default: DocumentAccessLevel.COMPANY,
    required: false,
  })
  @IsOptional()
  @IsEnum(DocumentAccessLevel)
  accessLevel?: DocumentAccessLevel;
}
