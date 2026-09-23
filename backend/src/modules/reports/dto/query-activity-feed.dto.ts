import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { MAX_PAGE_LIMIT } from '@shared/constants/pagination';
import { QueryReportsDto } from './query-reports.dto';

export class QueryActivityFeedDto extends QueryReportsDto {
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
}
