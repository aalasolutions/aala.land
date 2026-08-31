import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  IsBoolean,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CreateContactDto {
  // Nullable on the entity; a contact may start as a number only. When provided
  // it must be non-empty.
  @ApiPropertyOptional({ example: 'Ahmed' })
  @IsString()
  @IsNotEmpty()
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

  // Whether `phone` is reachable on WhatsApp. One number field, not two.
  @ApiPropertyOptional({ example: true, default: false })
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

  @ApiPropertyOptional({
    example: 'dubai',
    description: 'Defaults to the company default region when omitted',
  })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  regionCode?: string;
}
