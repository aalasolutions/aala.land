import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsIn,
  IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NOTIFICATION_TYPE_VALUES } from '../../../shared/taxonomies';

export class CreateNotificationDto {
  @ApiProperty()
  @IsUUID()
  @IsNotEmpty()
  userId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  message: string;

  @ApiPropertyOptional({ enum: NOTIFICATION_TYPE_VALUES })
  @IsIn(NOTIFICATION_TYPE_VALUES)
  @IsOptional()
  type?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  entityType?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  entityId?: string;
}
