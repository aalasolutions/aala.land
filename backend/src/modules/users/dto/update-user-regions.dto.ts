import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsString, MaxLength } from 'class-validator';

export class UpdateUserRegionsDto {
  @ApiProperty({
    example: ['makkah', 'punjab'],
    description:
      'Full replacement set. An empty array clears every assignment, which leaves the user with no region.',
  })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  regionCodes: string[];
}
