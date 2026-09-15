import {
  IsOptional,
  IsString,
  IsEnum,
  IsUUID,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { RecordHistoryAction } from '../entities/record-history.entity';

export class QueryRecordHistoryDto {
  @ApiProperty({ required: false, type: Number, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiProperty({ required: false, type: Number, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiProperty({ required: false, enum: RecordHistoryAction })
  @IsOptional()
  @IsEnum(RecordHistoryAction)
  action?: RecordHistoryAction;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  entityType?: string;

  @ApiProperty({ required: false, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  entityId?: string;

  @ApiProperty({
    required: false,
    description:
      'Applied for region-scoped roles only. Admins read every region, including NULL-region rows.',
  })
  @IsOptional()
  @IsString()
  regionCode?: string;
}
