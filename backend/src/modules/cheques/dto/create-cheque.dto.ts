import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsEnum,
  IsNumber,
  Min,
  MaxLength,
} from 'class-validator';
import { IsDateOnly } from '@shared/decorators/is-date-only.decorator';
import { ApiProperty } from '@nestjs/swagger';
import { ChequeType } from '../entities/cheque.entity';

export class CreateChequeDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  chequeNumber: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  bankName: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  accountHolder: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiProperty({
    required: false,
    description:
      "Accepted but IGNORED. The stored currency is derived from the record's region, so the response may carry a different code than the request.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @ApiProperty({
    description: 'Cheque due date',
    format: 'date',
    example: '2026-02-15',
  })
  @IsDateOnly()
  dueDate: string;

  @ApiProperty({ enum: ChequeType, default: ChequeType.RENT })
  @IsOptional()
  @IsEnum(ChequeType)
  type?: ChequeType;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  leaseId?: string;

  @ApiProperty({
    required: false,
    description: 'Link cheque to a property unit',
  })
  @IsOptional()
  @IsUUID()
  unitId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({
    required: false,
    example: 'dubai',
    description: 'Region code, used when the cheque has no unit',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  regionCode?: string;
}
