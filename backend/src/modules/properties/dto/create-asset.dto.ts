import { IsString, IsNotEmpty, IsOptional, IsUUID, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAssetDto {
  @ApiProperty({ example: 'Bay Tower' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiProperty({ example: 'uuid-of-locality' })
  @IsUUID()
  @IsNotEmpty()
  localityId: string;

  @ApiPropertyOptional({ example: '123 Sheikh Zayed Road, Dubai' })
  @IsString()
  @IsOptional()
  address?: string;
}
