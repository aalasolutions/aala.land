import { IsString, IsOptional, IsUUID, IsEnum, IsNumber, Min, IsDateString, MaxLength, IsArray, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { WorkOrderStatus, WorkOrderPriority, WorkOrderCategory, ScheduleFrequency } from '../entities/work-order.entity';

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

  @ApiProperty({ enum: WorkOrderStatus, required: false })
  @IsOptional()
  @IsEnum(WorkOrderStatus)
  status?: WorkOrderStatus;

  @ApiProperty({ enum: WorkOrderPriority, required: false })
  @IsOptional()
  @IsEnum(WorkOrderPriority)
  priority?: WorkOrderPriority;

  @ApiProperty({ enum: WorkOrderCategory, required: false })
  @IsOptional()
  @IsEnum(WorkOrderCategory)
  category?: WorkOrderCategory;

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

  @ApiProperty({ enum: ScheduleFrequency, required: false })
  @IsOptional()
  @IsEnum(ScheduleFrequency)
  scheduleFrequency?: ScheduleFrequency;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  nextScheduledDate?: string;
}
