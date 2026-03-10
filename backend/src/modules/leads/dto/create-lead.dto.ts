import { IsString, IsNotEmpty, IsOptional, IsEmail, IsEnum, IsInt, IsNumber, Min, Max, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LeadStatus, LeadTemperature, LeadSource } from '../entities/lead.entity';

export class CreateLeadDto {
  @ApiProperty({ example: 'Ahmed' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName: string;

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

  @ApiPropertyOptional({ enum: LeadStatus, default: LeadStatus.NEW })
  @IsEnum(LeadStatus)
  @IsOptional()
  status?: LeadStatus;

  @ApiPropertyOptional({ enum: LeadTemperature, default: LeadTemperature.WARM })
  @IsEnum(LeadTemperature)
  @IsOptional()
  temperature?: LeadTemperature;

  @ApiPropertyOptional({ enum: LeadSource, default: LeadSource.OTHER })
  @IsEnum(LeadSource)
  @IsOptional()
  source?: LeadSource;

  @ApiPropertyOptional({ example: 50, minimum: 0, maximum: 100 })
  @IsInt()
  @Min(0)
  @Max(100)
  @IsOptional()
  score?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  propertyInterest?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ example: 100000 })
  @IsNumber()
  @IsOptional()
  budgetMin?: number;

  @ApiPropertyOptional({ example: 500000 })
  @IsNumber()
  @IsOptional()
  budgetMax?: number;

  @ApiPropertyOptional({ example: 'uuid-of-property-area' })
  @IsString()
  @IsOptional()
  propertyId?: string;

  @ApiPropertyOptional({ example: 'uuid-of-unit' })
  @IsString()
  @IsOptional()
  unitId?: string;
}
