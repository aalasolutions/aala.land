import { IsUrl } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ProcessOcrDto {
  // https-only: this URL is forwarded to the OCR provider to fetch; blocks file:// and javascript:.
  @ApiProperty({ description: 'HTTPS URL of the cheque image to OCR' })
  @IsUrl({ protocols: ['https'], require_protocol: true })
  imageUrl: string;
}
