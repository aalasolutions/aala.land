import { IsString, IsEmail, IsNotEmpty, IsOptional, IsEnum, MinLength, MaxLength, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '../../../shared/enums/roles.enum';

export class CreateUserDto {
  @ApiProperty({ example: 'Jane Smith' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiProperty({ example: 'jane@company.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'SecurePass123!' })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  password: string;

  @ApiPropertyOptional({ enum: Role, default: Role.AGENT })
  @IsEnum(Role)
  @IsOptional()
  role?: Role;

  @ApiPropertyOptional({ example: '+971501234567' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  phone?: string;

  @ApiPropertyOptional({ example: 'en', default: 'en' })
  @IsString()
  @IsOptional()
  @MaxLength(5)
  preferredLanguage?: string;

  @ApiPropertyOptional({ example: 'DD/MM/YYYY', default: 'DD/MM/YYYY' })
  @IsString()
  @IsOptional()
  @MaxLength(20)
  dateFormat?: string;

  @ApiPropertyOptional({ example: 'Asia/Dubai', default: 'Asia/Dubai' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  timezone?: string;

  @ApiPropertyOptional({ example: '550e8400-e29b-41d4-a716-446655440000', description: 'companyId extracted from JWT for company admins. Required for SUPER_ADMIN to assign user to a company.' })
  @IsOptional()
  @IsUUID()
  companyId?: string;

  // companyId is extracted from JWT for company admins
}
