import { IsString, IsEmail, IsNotEmpty, IsOptional, IsEnum, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '../../../shared/enums/roles.enum';

export class InviteUserDto {
  @ApiProperty({ example: 'jane@company.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'Jane' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  firstName: string;

  @ApiProperty({ example: 'Smith' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  lastName: string;

  @ApiPropertyOptional({ enum: Role, default: Role.AGENT })
  @IsEnum(Role)
  @IsOptional()
  role?: Role;
}
