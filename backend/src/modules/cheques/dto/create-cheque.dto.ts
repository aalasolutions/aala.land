import { IsString, IsNotEmpty, IsOptional, IsUUID, IsEnum, IsNumber, Min, IsDateString, MaxLength } from 'class-validator';
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

  @ApiProperty({ required: false, default: 'AED' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @ApiProperty({ description: 'Cheque due date (ISO 8601)' })
  @IsDateString()
  dueDate: string;

  @ApiProperty({ enum: ChequeType, default: ChequeType.RENT })
  @IsOptional()
  @IsEnum(ChequeType)
  type?: ChequeType;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  leaseId?: string;

  @ApiProperty({ required: false, description: 'Link cheque to a property unit' })
  @IsOptional()
  @IsUUID()
  unitId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}
