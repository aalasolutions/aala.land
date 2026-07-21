import { IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateEmailPreferencesDto {
  @ApiPropertyOptional({ description: 'Billing receipts and reminders' })
  @IsOptional()
  @IsBoolean()
  billing?: boolean;

  @ApiPropertyOptional({ description: 'Product update announcements' })
  @IsOptional()
  @IsBoolean()
  productUpdates?: boolean;

  @ApiPropertyOptional({ description: 'Weekly / monthly stats digest' })
  @IsOptional()
  @IsBoolean()
  statsDigest?: boolean;
}
