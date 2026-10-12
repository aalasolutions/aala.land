import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  Min,
  IsInt,
  IsUUID,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ContactIdentityDto } from '../../contacts/dto/contact-identity.dto';
import { IsDateOnly } from '@shared/decorators/is-date-only.decorator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LeaseStatus, LeaseType } from '../entities/lease.entity';

export class UpdateLeaseDto {
  @ApiProperty({ enum: LeaseStatus, required: false })
  @IsOptional()
  @IsEnum(LeaseStatus)
  status?: LeaseStatus;

  @ApiProperty({ enum: LeaseType, required: false })
  @IsOptional()
  @IsEnum(LeaseType)
  type?: LeaseType;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  unitId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  contactId?: string;

  // Used only when contactId is absent: resolves or creates the tenant by phone or email.
  @ApiPropertyOptional({ type: ContactIdentityDto })
  @ValidateNested()
  @Type(() => ContactIdentityDto)
  @IsOptional()
  tenant?: ContactIdentityDto;

  @ApiProperty({ required: false, format: 'date', example: '2026-01-01' })
  @IsOptional()
  @IsDateOnly()
  startDate?: string;

  @ApiProperty({ required: false, format: 'date', example: '2026-12-31' })
  @IsOptional()
  @IsDateOnly()
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
  @ValidateIf(
    (o: { numberOfCheques?: unknown }) => o.numberOfCheques !== undefined,
  )
  @IsInt()
  @Min(1)
  numberOfCheques?: number;

  @ApiProperty({
    required: false,
    description:
      'Government lease registry reference, for example Ejari in Dubai or Tawtheeq in Abu Dhabi.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  tenancyRegistrationRef?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}
