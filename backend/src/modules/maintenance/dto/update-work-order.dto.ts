import {
  IsString,
  IsOptional,
  IsUUID,
  IsEnum,
  IsIn,
  IsNumber,
  Min,
  IsDateString,
  MaxLength,
  IsArray,
  IsBoolean,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { WorkOrderPriority } from '../entities/work-order.entity';
import {
  SCHEDULE_FREQUENCY_VALUES,
  WORK_ORDER_CATEGORY_VALUES,
  WORK_ORDER_STATUS_VALUES,
} from '../../../shared/taxonomies';

export class UpdateWorkOrderDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: WORK_ORDER_STATUS_VALUES, required: false })
  @IsOptional()
  @IsIn(WORK_ORDER_STATUS_VALUES)
  status?: string;

  @ApiProperty({ enum: WorkOrderPriority, required: false })
  @IsOptional()
  @IsEnum(WorkOrderPriority)
  priority?: WorkOrderPriority;

  @ApiProperty({ enum: WORK_ORDER_CATEGORY_VALUES, required: false })
  @IsOptional()
  @IsIn(WORK_ORDER_CATEGORY_VALUES)
  category?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  vendorId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  assignedTo?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  estimatedCost?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  actualCost?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  scheduledDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  costNotes?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photos?: string[];

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  isPreventive?: boolean;

  @ApiProperty({ enum: SCHEDULE_FREQUENCY_VALUES, required: false })
  @IsOptional()
  @IsIn(SCHEDULE_FREQUENCY_VALUES)
  scheduleFrequency?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  nextScheduledDate?: string;
}
