import { IsString, IsNotEmpty, IsOptional, IsUUID, IsEnum, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { DocumentCategory, DocumentAccessLevel } from '../../properties/entities/property-document.entity';

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
  buildingId?: string;

  @ApiProperty({ enum: DocumentCategory, default: DocumentCategory.OTHER })
  @IsOptional()
  @IsEnum(DocumentCategory)
  category?: DocumentCategory;

  @ApiProperty({ enum: DocumentAccessLevel, default: DocumentAccessLevel.COMPANY })
  @IsOptional()
  @IsEnum(DocumentAccessLevel)
  accessLevel?: DocumentAccessLevel;
}
