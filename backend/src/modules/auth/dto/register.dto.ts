import {
  IsString,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'Jane Smith' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  userName: string;

  @ApiProperty({ example: 'jane@company.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'SecurePass123!' })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  password: string;

  @ApiProperty({
    example: 'BILAL01',
    required: false,
    description: 'Marketer/referral code; first-touch, immutable after signup',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  marketerCode?: string;
}
