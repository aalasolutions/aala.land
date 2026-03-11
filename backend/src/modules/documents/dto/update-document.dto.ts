import { IsString, IsOptional, IsEnum, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { DocumentCategory, DocumentAccessLevel } from '../../properties/entities/property-document.entity';

export class UpdateDocumentDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiProperty({ required: false, description: 'New URL creates a new version of the document' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  url?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  fileType?: string;

  @ApiProperty({ enum: DocumentCategory, required: false })
  @IsOptional()
  @IsEnum(DocumentCategory)
  category?: DocumentCategory;

  @ApiProperty({ enum: DocumentAccessLevel, required: false })
  @IsOptional()
  @IsEnum(DocumentAccessLevel)
  accessLevel?: DocumentAccessLevel;
}
