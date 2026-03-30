import { IsString, IsNotEmpty, IsUUID, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateLocalityDto {
    @ApiProperty({ example: 'Gulberg', description: 'Locality name' })
    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    name: string;

    @ApiProperty({ example: 'a1b2c3d4-...', description: 'City ID this locality belongs to' })
    @IsUUID()
    @IsNotEmpty()
    cityId: string;
}
