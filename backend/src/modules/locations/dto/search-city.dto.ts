import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SearchCityDto {
    @ApiProperty({ example: 'Lahore', description: 'Search query for city name' })
    @IsString()
    @IsNotEmpty()
    q: string;

    @ApiProperty({ example: 'punjab', description: 'Region code to search within' })
    @IsString()
    @IsNotEmpty()
    regionCode: string;
}
