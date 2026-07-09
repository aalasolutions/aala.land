import {
  IsString,
  IsOptional,
  IsEnum,
  IsIn,
  IsNumber,
  Min,
  IsDateString,
  IsInt,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import {
  LEASE_STATUS_VALUES,
  LEASE_TYPE_VALUES,
} from '../../../shared/taxonomies';

export class UpdateLeaseDto {
  @ApiProperty({ enum: LEASE_STATUS_VALUES, required: false })
  @IsOptional()
  @IsIn(LEASE_STATUS_VALUES)
  status?: string;

  @ApiProperty({ enum: LEASE_TYPE_VALUES, required: false })
  @IsOptional()
  @IsIn(LEASE_TYPE_VALUES)
  type?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  tenantName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  tenantEmail?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  tenantPhone?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  monthlyRent?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  securityDeposit?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  numberOfCheques?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  ejariNumber?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}
