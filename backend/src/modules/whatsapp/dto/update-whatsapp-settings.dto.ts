import { IsString, IsOptional, MaxLength } from 'class-validator';

export class UpdateWhatsappSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  aiPrompt?: string | null;
}
