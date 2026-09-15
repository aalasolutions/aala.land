import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class DeleteContactDto {
  @ApiProperty({ maxLength: 500, example: 'Duplicate contact' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;

  @ApiProperty({
    required: false,
    format: 'uuid',
    description:
      'Required when the contact has leads, units, leases or chats: their edges move to this contact first.',
  })
  @IsOptional()
  @IsUUID()
  transferToContactId?: string;
}
