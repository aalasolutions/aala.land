import {
  IsString,
  IsOptional,
  IsEmail,
  IsEnum,
  IsIn,
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
  LEAD_STATUS_VALUES,
  LEAD_TEMPERATURE_VALUES,
} from '../../../shared/taxonomies';

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

  @ApiPropertyOptional({ enum: LEAD_STATUS_VALUES })
  @ValidateIf((_obj, value) => value !== undefined)
  @IsIn(LEAD_STATUS_VALUES)
  status?: string;

  @ApiPropertyOptional({ enum: LEAD_TEMPERATURE_VALUES })
  @IsIn(LEAD_TEMPERATURE_VALUES)
  @IsOptional()
  temperature?: string;

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
  propertyId?: string | null;

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
