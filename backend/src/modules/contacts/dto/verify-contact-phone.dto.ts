import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyContactPhoneDto {
  @ApiProperty({ example: '+971501234567', maxLength: 30 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  phone: string;
}
