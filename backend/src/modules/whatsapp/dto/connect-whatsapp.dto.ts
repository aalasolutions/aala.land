// backend/src/modules/whatsapp/dto/connect-whatsapp.dto.ts
import { IsString, IsNotEmpty, Matches, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

const trimmed = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// Meta node ids are numeric strings. Both of these are interpolated into a Graph URL,
// so digits-only is a real injection guard and not decoration.
const META_NODE_ID = /^\d{1,64}$/;

export class ConnectWhatsappDto {
  // Embedded Signup v4 hands back an exchangeable code with a 30-SECOND time to live.
  // The shape is opaque, so it is bounded rather than pattern-matched.
  @ApiProperty({
    description: 'Exchangeable token code returned by Embedded Signup (30s TTL)',
  })
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  code: string;

  @ApiProperty({
    description: "The client's WhatsApp Business Account id, from session logging",
    example: '102290129340398',
  })
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @Matches(META_NODE_ID, { message: 'wabaId must be a numeric Meta node id' })
  wabaId: string;

  @ApiProperty({
    description: 'Phone number id, the routing key on every inbound webhook',
    example: '106540352242922',
  })
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @Matches(META_NODE_ID, {
    message: 'phoneNumberId must be a numeric Meta node id',
  })
  phoneNumberId: string;
}
