import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ImportBodyDto {
  @ApiProperty({
    required: false,
    description: 'Region for rows whose Region cell is blank',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  regionCode?: string;
}
