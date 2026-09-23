import { IsDateOnly } from '@shared/decorators/is-date-only.decorator';
import { IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ClearChequeDto {
  @ApiProperty({
    description: 'The day the bank honoured the cheque',
    format: 'date',
    example: '2026-09-21',
  })
  @IsDateOnly()
  clearedDate: string;

  @ApiPropertyOptional({
    description:
      'The day it was deposited. Only accepted when the cheque has none yet, i.e. when clearing straight from PENDING.',
    format: 'date',
    example: '2026-09-18',
  })
  @IsOptional()
  @IsDateOnly()
  depositDate?: string;
}
