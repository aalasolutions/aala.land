import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

export class TrimCompanyUsersDto {
    @ApiProperty({
        description: 'The single user who stays active. Must be an active company admin of this company.',
        format: 'uuid',
    })
    @IsUUID()
    keepUserId: string;

    @ApiProperty({
        description: 'Why the company is trimming to one user (typically: downgrading to Free).',
        maxLength: 255,
        example: 'Downgrading to the Free plan',
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    reason: string;
}
