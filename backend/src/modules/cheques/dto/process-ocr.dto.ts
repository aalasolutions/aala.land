import { IsUrl } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ProcessOcrDto {
  // https-only: rejects file://, javascript:, and non-URL strings that were
  // previously accepted verbatim via @Body('imageUrl'). The URL is forwarded to
  // the OCR provider to fetch, so it must be a real remote image URL.
  @ApiProperty({ description: 'HTTPS URL of the cheque image to OCR' })
  @IsUrl({ protocols: ['https'], require_protocol: true })
  imageUrl: string;
}
