import { MAX_PAGE_LIMIT } from '@shared/constants/pagination';
import {
  IsOptional,
  IsString,
  IsEnum,
  IsUUID,
  IsInt,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { RecordHistoryAction } from '../entities/record-history.entity';

export class QueryRecordHistoryDto {
  @ApiProperty({ required: false, type: Number, default: 1, maximum: 10000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  page?: number = 1;

  @ApiProperty({ required: false, type: Number, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_LIMIT)
  limit?: number = 20;

  @ApiProperty({ required: false, enum: RecordHistoryAction })
  @IsOptional()
  @IsEnum(RecordHistoryAction)
  action?: RecordHistoryAction;

  @ApiProperty({ required: false, maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  entityType?: string;

  @ApiProperty({ required: false, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  entityId?: string;

  @ApiProperty({
    required: false,
    maxLength: 50,
    description:
      'Applied for region-scoped roles only. Admins read every region, including NULL-region rows.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  regionCode?: string;
}
