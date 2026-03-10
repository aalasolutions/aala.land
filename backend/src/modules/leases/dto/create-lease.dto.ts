import {
  IsString, IsNotEmpty, IsOptional, IsUUID, IsEnum,
  IsNumber, Min, IsDateString, IsInt, MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { LeaseType } from '../entities/lease.entity';

export class CreateLeaseDto {
  @ApiProperty()
  @IsUUID()
  unitId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  tenantName: string;

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
  @IsString()
  @MaxLength(50)
  tenantNationalId?: string;

  @ApiProperty({ enum: LeaseType, default: LeaseType.RESIDENTIAL })
  @IsOptional()
  @IsEnum(LeaseType)
  type?: LeaseType;

  @ApiProperty({ description: 'Start date (ISO 8601)' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ description: 'End date (ISO 8601)' })
  @IsDateString()
  endDate: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  monthlyRent: number;

  @ApiProperty({ required: false, default: 'AED' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  securityDeposit?: number;

  @ApiProperty({ required: false, default: 1 })
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
