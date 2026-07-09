import {
  IsString,
  IsOptional,
  IsEmail,
  IsEnum,
  IsIn,
  IsArray,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CONTACT_TYPE_VALUES } from '../../../shared/taxonomies';

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

  @ApiPropertyOptional({ example: '+971501234567' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  whatsappNumber?: string;

  @ApiPropertyOptional({ enum: CONTACT_TYPE_VALUES })
  @IsIn(CONTACT_TYPE_VALUES)
  @IsOptional()
  type?: string;

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

  @ApiPropertyOptional({ example: ['VIP', 'dubai-marina'], type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @ApiPropertyOptional({ example: 'uuid-of-lead' })
  @IsUUID()
  @IsOptional()
  leadId?: string;
}
