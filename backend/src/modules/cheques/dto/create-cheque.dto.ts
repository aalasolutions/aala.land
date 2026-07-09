import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsEnum,
  IsIn,
  IsNumber,
  Min,
  IsDateString,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CHEQUE_TYPE_VALUES } from '../../../shared/taxonomies';

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

  @ApiProperty({ required: false, default: 'AED' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @ApiProperty({ description: 'Cheque due date (ISO 8601)' })
  @IsDateString()
  dueDate: string;

  @ApiProperty({ enum: CHEQUE_TYPE_VALUES, default: 'RENT' })
  @IsOptional()
  @IsIn(CHEQUE_TYPE_VALUES)
  type?: string;

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
}
