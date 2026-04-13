import { IsString, IsNotEmpty, IsUUID, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SearchLocalityDto {
    @ApiProperty({ example: 'Gulberg', description: 'Search query for locality name' })
    @IsString()
    @IsNotEmpty()
    q: string;

    @ApiProperty({ example: 'a1b2c3d4-...', description: 'City ID to search within' })
    @IsUUID()
    @IsNotEmpty()
    cityId: string;

    @ApiPropertyOptional({ description: 'Region code (auto-injected by frontend, ignored by this endpoint)' })
    @IsString()
    @IsOptional()
    regionCode?: string;
}
