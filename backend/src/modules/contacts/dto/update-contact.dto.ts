import {
  IsString,
  IsOptional,
  IsEmail,
  IsBoolean,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateContactDto {
  @ApiPropertyOptional({ example: 'Ahmed' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Al-Rashid' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional({ example: 'ahmed@example.com' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ example: '+971501234567' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  phone?: string;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  isWhatsapp?: boolean;

  @ApiPropertyOptional({ example: 'Emirati' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  nationality?: string;

  @ApiPropertyOptional({ example: '784-1234-5678901-1' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  nationalId?: string;

  @ApiPropertyOptional({ example: 'Emaar Properties' })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  contactCompany?: string;

  @ApiPropertyOptional({ example: 'Property Manager' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  jobTitle?: string;

  @ApiPropertyOptional({ example: 'Business Bay, Dubai, UAE' })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiPropertyOptional({ example: 'Prefers WhatsApp communication' })
  @IsString()
  @IsOptional()
  notes?: string;
}
