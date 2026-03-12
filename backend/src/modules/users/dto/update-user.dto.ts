import { IsString, IsOptional, IsEnum, IsBoolean, MinLength, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '../../../shared/enums/roles.enum';

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'Jane Smith Updated' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ example: 'NewSecurePass123!' })
  @IsString()
  @IsOptional()
  @MinLength(8)
  password?: string;

  @ApiPropertyOptional({ enum: Role })
  @IsEnum(Role)
  @IsOptional()
  role?: Role;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({ example: '+971501234567' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  phone?: string;

  @ApiPropertyOptional({ example: 'en' })
  @IsString()
  @IsOptional()
  @MaxLength(5)
  preferredLanguage?: string;

  @ApiPropertyOptional({ example: 'DD/MM/YYYY' })
  @IsString()
  @IsOptional()
  @MaxLength(20)
  dateFormat?: string;

  @ApiPropertyOptional({ example: 'Asia/Dubai' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  timezone?: string;
}
