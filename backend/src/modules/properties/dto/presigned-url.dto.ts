import { IsString, IsNotEmpty, IsIn, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PresignedUrlDto {
  @ApiProperty({ description: 'File name including extension' })
  @IsString()
  @IsNotEmpty()
  fileName: string;

  @ApiProperty({ description: 'MIME content type', example: 'image/jpeg' })
  @IsString()
  @IsNotEmpty()
  @IsIn([
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.document',
  ])
  contentType: string;

  @ApiProperty({ description: 'Unit ID this media belongs to', required: false })
  @IsOptional()
  @IsUUID()
  unitId?: string;
}
