import { IsEmail, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'user@company.com', description: 'Email address of the account' })
  @IsEmail()
  @IsNotEmpty()
  email: string;
}
