import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CommissionType } from '../entities/commission.entity';

export class CreateCommissionDto {
  @ApiProperty()
  @IsUUID()
  agentId: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  leadId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  transactionId?: string;

  @ApiProperty({ enum: CommissionType })
  @IsEnum(CommissionType)
  type: CommissionType;

  @ApiProperty({ description: 'Transaction gross amount' })
  @IsNumber()
  @Min(0)
  grossAmount: number;

  @ApiProperty({
    description: 'Commission rate as percentage (e.g. 2.5 for 2.5%)',
  })
  @IsNumber()
  @Min(0)
  @Max(100)
  commissionRate: number;

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
  @IsString()
  notes?: string;

  @ApiProperty({
    required: false,
    example: 'dubai',
    description: 'Region code for multi-region filtering',
  })
  @IsOptional()
  @IsString()
  regionCode?: string;
}
