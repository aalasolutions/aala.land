import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

export class RemoveUserDto {
    @ApiProperty({
        description: 'Active user in the same company who receives every reassigned record',
        format: 'uuid',
        example: '9460c4c5-344a-4782-963e-8ec3b2b52479',
    })
    @IsUUID()
    reassignToUserId: string;

    @ApiProperty({
        description: 'Why the user is being removed. Carried on the ReassignmentReport and later persisted by the ownership-transfer-logs unit.',
        maxLength: 255,
        example: 'Agent left the company',
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    reason: string;
}
