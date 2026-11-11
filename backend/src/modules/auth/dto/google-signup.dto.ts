import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GoogleSignupDto {
  @ApiProperty({ description: 'Google ID token from frontend' })
  @IsString()
  @IsNotEmpty()
  idToken: string;

  @ApiProperty({
    required: false,
    description: 'Marketer/referral code; first-touch, immutable after signup',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  marketerCode?: string;
}
