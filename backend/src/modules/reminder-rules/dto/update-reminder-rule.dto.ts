import { IsString, IsOptional, IsEnum, IsInt, Min, IsBoolean, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ReminderRuleType } from '../entities/reminder-rule.entity';

export class UpdateReminderRuleDto {
  @ApiPropertyOptional({ example: 'Rent Due 5 Days Before' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ enum: ReminderRuleType })
  @IsEnum(ReminderRuleType)
  @IsOptional()
  type?: ReminderRuleType;

  @ApiPropertyOptional({ example: 5 })
  @IsInt()
  @Min(1)
  @IsOptional()
  triggerDaysBefore?: number;

  @ApiPropertyOptional({ example: false })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({ example: 'Updated reminder message' })
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  message?: string;
}
