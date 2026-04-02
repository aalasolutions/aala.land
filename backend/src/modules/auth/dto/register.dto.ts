import { IsString, IsEmail, IsNotEmpty, MinLength, MaxLength, Validate } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsValidRegionCode } from '../../companies/validators/is-valid-region-code.validator';

export class RegisterDto {
  @ApiProperty({ example: 'Acme Real Estate' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  companyName: string;

  @ApiProperty({ example: 'acme-real-estate' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  companySlug: string;

  @ApiProperty({ example: 'punjab' })
  @IsString()
  @IsNotEmpty()
  @Validate(IsValidRegionCode)
  defaultRegionCode: string;

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
}
