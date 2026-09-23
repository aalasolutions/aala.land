import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsUUID,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { LeadStatus } from '../entities/lead.entity';
import { MAX_PAGE_LIMIT } from '@shared/constants/pagination';

export class ReorderLeadsDto {
  @ApiProperty({ enum: LeadStatus })
  @IsEnum(LeadStatus)
  status: LeadStatus;

  @ApiProperty({ type: [String], description: 'Lead ids, top to bottom' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_PAGE_LIMIT)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  orderedIds: string[];
}
