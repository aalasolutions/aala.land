import { IsString, IsEmail, IsOptional, IsNotEmpty, IsUUID, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateOwnerDto {
  @ApiProperty({ example: 'Anthropic Corporation' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

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
  @IsUUID()
  @IsOptional()
  assignedAgentId?: string;
}
