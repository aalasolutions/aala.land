import {
  IsString,
  IsOptional,
  IsEmail,
  IsEnum,
  IsInt,
  Min,
  Max,
  MaxLength,
  IsUUID,
  IsNotEmpty,
  ValidateIf,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  LeadStatus,
  LeadTemperature,
  LeadSource,
} from '../entities/lead.entity';

export class UpdateLeadDto {
  @ApiPropertyOptional({ nullable: true })
  @IsUUID()
  @IsOptional()
  contactId?: string | null;

  @ApiPropertyOptional({ enum: LeadStatus })
  @ValidateIf((_obj, value) => value !== undefined)
  @IsEnum(LeadStatus)
  status?: LeadStatus;

  @ApiPropertyOptional({ enum: LeadTemperature })
  @IsEnum(LeadTemperature)
  @IsOptional()
  temperature?: LeadTemperature;

  @ApiPropertyOptional({ enum: LeadSource })
  @IsEnum(LeadSource)
  @IsOptional()
  source?: LeadSource;

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

  @ApiPropertyOptional({ nullable: true })
  @IsUUID()
  @IsOptional()
  cityId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsUUID()
  @IsOptional()
  localityId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsUUID()
  @IsOptional()
  unitId?: string | null;

  @ApiPropertyOptional({ example: 'dubai' })
  @ValidateIf((_obj, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  regionCode?: string;
}
