import { IsString, IsNotEmpty, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({ description: 'Password reset token received via email' })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({ example: 'NewSecure123!', description: 'New password (minimum 8 characters)' })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  newPassword: string;
}
