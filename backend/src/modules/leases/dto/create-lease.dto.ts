import {
  IsString,
  IsOptional,
  IsUUID,
  IsEnum,
  IsNumber,
  Min,
  IsInt,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ContactIdentityDto } from '../../contacts/dto/contact-identity.dto';
import { IsDateOnly } from '@shared/decorators/is-date-only.decorator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

  // Used only when contactId is absent: resolves or creates the tenant by phone or email.
  @ApiPropertyOptional({ type: ContactIdentityDto })
  @ValidateNested()
  @Type(() => ContactIdentityDto)
  @IsOptional()
  tenant?: ContactIdentityDto;

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

  @ApiProperty({
    required: false,
    description:
      "Accepted but IGNORED. The stored currency is derived from the record's region, so the response may carry a different code than the request.",
  })
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
