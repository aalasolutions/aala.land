import {
  IsString,
  IsOptional,
  IsEnum,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import {
  DocumentCategory,
  DocumentAccessLevel,
} from '../../properties/entities/property-document.entity';

const LINK_DESCRIPTION =
  'Send null to unlink. A document links to at most one record.';

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

  @ApiProperty({ enum: DocumentCategory, required: false })
  @IsOptional()
  @IsEnum(DocumentCategory)
  category?: DocumentCategory;

  @ApiProperty({ enum: DocumentAccessLevel, required: false })
  @IsOptional()
  @IsEnum(DocumentAccessLevel)
  accessLevel?: DocumentAccessLevel;

  @ApiProperty({
    required: false,
    nullable: true,
    description: LINK_DESCRIPTION,
  })
  @ValidateIf(
    (o: UpdateDocumentDto) => o.unitId !== null && o.unitId !== undefined,
  )
  @IsUUID()
  unitId?: string | null;

  @ApiProperty({
    required: false,
    nullable: true,
    description: LINK_DESCRIPTION,
  })
  @ValidateIf(
    (o: UpdateDocumentDto) => o.assetId !== null && o.assetId !== undefined,
  )
  @IsUUID()
  assetId?: string | null;

  @ApiProperty({
    required: false,
    nullable: true,
    description: LINK_DESCRIPTION,
  })
  @ValidateIf(
    (o: UpdateDocumentDto) => o.contactId !== null && o.contactId !== undefined,
  )
  @IsUUID()
  contactId?: string | null;

  @ApiProperty({
    required: false,
    nullable: true,
    description: LINK_DESCRIPTION,
  })
  @ValidateIf(
    (o: UpdateDocumentDto) => o.leaseId !== null && o.leaseId !== undefined,
  )
  @IsUUID()
  leaseId?: string | null;

  @ApiProperty({
    required: false,
    nullable: true,
    description: LINK_DESCRIPTION,
  })
  @ValidateIf(
    (o: UpdateDocumentDto) =>
      o.workOrderId !== null && o.workOrderId !== undefined,
  )
  @IsUUID()
  workOrderId?: string | null;
}
