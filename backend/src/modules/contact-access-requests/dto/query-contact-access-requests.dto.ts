import { MAX_PAGE_LIMIT } from '@shared/constants/pagination';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ContactAccessKind,
  ContactAccessStatus,
} from '../entities/contact-access-request.entity';

export class QueryContactAccessRequestsDto {
  @ApiPropertyOptional({ enum: ContactAccessStatus })
  @IsOptional()
  @IsEnum(ContactAccessStatus)
  status?: ContactAccessStatus;

  @ApiPropertyOptional({
    enum: ContactAccessKind,
    description:
      'Defaults to REQUEST; LINK and VERIFIED grants are listed only when asked for.',
  })
  @IsOptional()
  @IsEnum(ContactAccessKind)
  kind?: ContactAccessKind;

  @ApiPropertyOptional({
    type: Boolean,
    description: "Only the caller's own requests",
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  mine?: boolean;

  @ApiPropertyOptional({ type: Number, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ type: Number, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_LIMIT)
  limit?: number = 20;

  // Injected by RegionScopeInterceptor; scoping here uses the caller's assigned regions instead
  @ApiPropertyOptional({ maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  regionCode?: string;
}
