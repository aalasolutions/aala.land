import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCityDto {
    @ApiProperty({ example: 'Lahore', description: 'City name' })
    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    name: string;

    @ApiProperty({ example: 'punjab', description: 'Region code' })
    @IsString()
    @IsNotEmpty()
    @MaxLength(50)
    regionCode: string;
}
