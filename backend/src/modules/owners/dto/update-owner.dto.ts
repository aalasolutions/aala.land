import { IsString, IsEmail, IsOptional, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateOwnerDto {
  @ApiPropertyOptional({ example: 'Anthropic Corporation' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ example: 'contact@anthropic.com' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ example: '+971501234567' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  phone?: string;

  @ApiPropertyOptional({ example: 'A12345678' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  nationalityId?: string;

  @ApiPropertyOptional({ example: '123 Innovation Street, San Francisco, CA' })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiPropertyOptional({ example: 'Prefers email communication. Key decision maker.' })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ example: 'uuid-of-agent' })
  @IsString()
  @IsOptional()
  assignedAgentId?: string;
}
