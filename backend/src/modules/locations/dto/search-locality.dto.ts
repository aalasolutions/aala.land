import { IsString, IsNotEmpty, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SearchLocalityDto {
    @ApiProperty({ example: 'Gulberg', description: 'Search query for locality name' })
    @IsString()
    @IsNotEmpty()
    q: string;

    @ApiProperty({ example: 'a1b2c3d4-...', description: 'City ID to search within' })
    @IsUUID()
    @IsNotEmpty()
    cityId: string;
}
