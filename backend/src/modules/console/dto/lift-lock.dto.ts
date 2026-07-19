import { IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** "Let them breathe": temporary unlock until a date (design section 8.1). */
export class LiftLockDto {
  @ApiProperty({ description: 'ISO date the lock re-applies automatically' })
  @IsDateString()
  liftUntil: string;
}
