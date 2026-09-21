import { IsDateOnly } from '@shared/decorators/is-date-only.decorator';
import { ApiProperty } from '@nestjs/swagger';

export class ClearChequeDto {
  @ApiProperty({
    description: 'The day the bank honoured the cheque',
    format: 'date',
    example: '2026-09-21',
  })
  @IsDateOnly()
  clearedDate: string;
}
