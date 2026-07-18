import { IsOptional, IsUUID, IsEnum, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { MediaType } from '../entities/property-media.entity';

export class UploadMediaDto {
  /**
   * Maps to PropertyMedia.unitId (DB column: unit_id).
   */
  @ApiProperty({
    description: 'Unit UUID this photo belongs to',
    required: false,
  })
  @Transform(({ value }) => value || undefined)
  @IsOptional()
  @IsUUID()
  unitId?: string;

  /**
   * Maps to PropertyMedia.assetId (DB column: building_id). Intentional legacy naming.
   */
  @ApiProperty({
    description: 'Asset UUID this photo belongs to',
    required: false,
  })
  @Transform(({ value }) => value || undefined)
  @IsOptional()
  @IsUUID()
  assetId?: string;

  @ApiProperty({
    enum: MediaType,
    description: 'Media type. Send lowercase: image, video, virtual_tour',
    required: false,
  })
  @IsOptional()
  @IsEnum(MediaType)
  type?: MediaType;

  @ApiProperty({ description: 'Set as primary photo', required: false })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isPrimary?: boolean;
}
