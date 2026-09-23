import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ListLocalityAssetsDto {
  @ApiProperty({ description: 'Locality whose assets are listed' })
  @IsUUID()
  @IsNotEmpty()
  localityId: string;

  @ApiPropertyOptional({
    description:
      'Region code (auto-injected by frontend, ignored by this endpoint)',
  })
  @IsString()
  @IsOptional()
  regionCode?: string;
}
