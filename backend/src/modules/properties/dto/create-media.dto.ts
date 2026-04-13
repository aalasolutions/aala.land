import { IsString, IsNotEmpty, IsOptional, IsUUID, IsEnum, IsBoolean, IsInt, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { MediaType } from '../entities/property-media.entity';

export class CreateMediaDto {
  @ApiProperty({ description: 'S3 file URL after upload' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  url: string;

  @ApiProperty({ description: 'S3 object key', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  s3Key?: string;

  @ApiProperty({ description: 'Original file name', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fileName?: string;

  @ApiProperty({ description: 'MIME content type', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  contentType?: string;

  @ApiProperty({ description: 'File size in bytes', required: false })
  @IsOptional()
  @IsInt()
  fileSize?: number;

  @ApiProperty({ enum: MediaType, default: MediaType.IMAGE, required: false })
  @IsOptional()
  @IsEnum(MediaType)
  type?: MediaType;

  @ApiProperty({ default: false, required: false })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @ApiProperty({ description: 'Unit ID this media belongs to', required: false })
  @IsOptional()
  @IsUUID()
  unitId?: string;

  @ApiProperty({ description: 'Asset ID this media belongs to', required: false })
  @IsOptional()
  @IsUUID()
  assetId?: string;
}
