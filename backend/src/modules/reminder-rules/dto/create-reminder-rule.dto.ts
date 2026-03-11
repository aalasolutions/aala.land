import { IsString, IsNotEmpty, IsOptional, IsEnum, IsInt, Min, IsBoolean, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReminderRuleType } from '../entities/reminder-rule.entity';

export class CreateReminderRuleDto {
  @ApiProperty({ example: 'Rent Due 3 Days Before' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiProperty({ enum: ReminderRuleType, example: ReminderRuleType.RENT_DUE })
  @IsEnum(ReminderRuleType)
  @IsNotEmpty()
  type: ReminderRuleType;

  @ApiProperty({ example: 3, description: 'Number of days before the event to trigger the reminder' })
  @IsInt()
  @Min(1)
  triggerDaysBefore: number;

  @ApiPropertyOptional({ example: true, default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({ example: 'Rent payment of {{amount}} AED is due on {{date}}' })
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  message?: string;
}
