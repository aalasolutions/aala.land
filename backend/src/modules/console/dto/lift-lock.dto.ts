import { IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LiftLockDto {
  @ApiProperty({ description: 'ISO date the lock re-applies automatically' })
  @IsDateString()
  liftUntil: string;
}
