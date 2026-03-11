import { IsString, IsOptional, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class BounceChequeDto {
  @ApiPropertyOptional({ example: 'Insufficient funds' })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  bounceReason?: string;
}
