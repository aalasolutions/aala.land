import { IsString, IsNotEmpty, MaxLength, Validate } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsValidRegionCode } from '../../companies/validators/is-valid-region-code.validator';

export class GoogleSignupDto {
  @ApiProperty({ description: 'Google ID token from frontend' })
  @IsString()
  @IsNotEmpty()
  idToken: string;

  @ApiProperty({ description: 'Company name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  companyName: string;

  @ApiProperty({ description: 'Primary operating region code' })
  @IsString()
  @IsNotEmpty()
  @Validate(IsValidRegionCode)
  regionCode: string;
}
