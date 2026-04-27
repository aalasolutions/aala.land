import { IsString, IsOptional, IsEmail, IsEnum, IsInt, Min, Max, MaxLength, IsUUID, IsNotEmpty, ValidateIf } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { LeadStatus, LeadTemperature } from '../entities/lead.entity';

export class UpdateLeadDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional()
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ enum: LeadStatus })
  @ValidateIf((_obj, value) => value !== undefined)
  @IsEnum(LeadStatus)
  status?: LeadStatus;

  @ApiPropertyOptional({ enum: LeadTemperature })
  @IsEnum(LeadTemperature)
  @IsOptional()
  temperature?: LeadTemperature;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsInt()
  @Min(0)
  @Max(100)
  @IsOptional()
  score?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsUUID()
  @IsOptional()
  assignedTo?: string | null;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  propertyId?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  unitId?: string;

  @ApiPropertyOptional({ example: 'dubai' })
  @ValidateIf((_obj, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  regionCode?: string;
}
