import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

// Multipart fields arrive as strings.
export class SendWaMediaDto {
  @ApiProperty({
    required: false,
    maxLength: 1024,
    description: 'Caption for an image, video or document',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(1024)
  caption?: string;

  @ApiProperty({
    required: false,
    description: 'Send an OGG/Opus audio file as a recorded voice note',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  voice?: boolean;
}
