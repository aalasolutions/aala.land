import {
  IsString,
  IsOptional,
  IsUUID,
  IsEnum,
  IsNumber,
  Min,
  IsInt,
  MaxLength,
} from 'class-validator';
import { IsDateOnly } from '@shared/decorators/is-date-only.decorator';
import { ApiProperty } from '@nestjs/swagger';
import { LeaseType } from '../entities/lease.entity';

export class CreateLeaseDto {
  @ApiProperty()
  @IsUUID()
  unitId: string;

  // The tenant is a contact. Identity and national ID live on the contact.
  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  contactId?: string;

  @ApiProperty({ enum: LeaseType, default: LeaseType.RESIDENTIAL })
  @IsOptional()
  @IsEnum(LeaseType)
  type?: LeaseType;

  @ApiProperty({
    description: 'Start date',
    format: 'date',
    example: '2026-01-01',
  })
  @IsDateOnly()
  startDate: string;

  @ApiProperty({
    description: 'End date',
    format: 'date',
    example: '2026-12-31',
  })
  @IsDateOnly()
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
  tenancyRegistrationRef?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}
