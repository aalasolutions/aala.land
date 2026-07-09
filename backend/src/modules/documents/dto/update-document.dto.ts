import { IsString, IsOptional, IsEnum, IsIn, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { DocumentAccessLevel } from '../../properties/entities/property-document.entity';
import { DOCUMENT_CATEGORY_VALUES } from '../../../shared/taxonomies';

export class UpdateDocumentDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  fileType?: string;

  @ApiProperty({ enum: DOCUMENT_CATEGORY_VALUES, required: false })
  @IsOptional()
  @IsIn(DOCUMENT_CATEGORY_VALUES)
  category?: string;

  @ApiProperty({ enum: DocumentAccessLevel, required: false })
  @IsOptional()
  @IsEnum(DocumentAccessLevel)
  accessLevel?: DocumentAccessLevel;
}
