import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsEnum,
  IsIn,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { DocumentAccessLevel } from '../../properties/entities/property-document.entity';
import { DOCUMENT_CATEGORY_VALUES } from '../../../shared/taxonomies';

export class CreateDocumentDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  url: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  fileType?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  unitId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  assetId?: string;

  @ApiProperty({ enum: DOCUMENT_CATEGORY_VALUES, default: 'OTHER' })
  @IsOptional()
  @IsIn(DOCUMENT_CATEGORY_VALUES)
  category?: string;

  @ApiProperty({
    enum: DocumentAccessLevel,
    default: DocumentAccessLevel.COMPANY,
  })
  @IsOptional()
  @IsEnum(DocumentAccessLevel)
  accessLevel?: DocumentAccessLevel;
}
