import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LEAD_BOARDS, LeadBoard } from '../entities/lead.entity';

export class ReorderLeadsDto {
  @ApiProperty({ enum: Object.keys(LEAD_BOARDS) })
  @IsIn(Object.keys(LEAD_BOARDS))
  board: LeadBoard;

  @ApiProperty({ description: 'The lead being moved' })
  @IsUUID()
  leadId: string;

  @ApiPropertyOptional({ description: 'Lead directly above after the move' })
  @IsOptional()
  @IsUUID()
  aboveId?: string;

  @ApiPropertyOptional({ description: 'Lead directly below after the move' })
  @IsOptional()
  @IsUUID()
  belowId?: string;
}
