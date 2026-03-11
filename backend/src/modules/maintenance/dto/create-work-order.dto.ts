import { IsString, IsNotEmpty, IsOptional, IsUUID, IsEnum, IsNumber, Min, IsDateString, MaxLength, IsArray, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { WorkOrderPriority, WorkOrderCategory, ScheduleFrequency } from '../entities/work-order.entity';

export class CreateWorkOrderDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ enum: WorkOrderPriority, default: WorkOrderPriority.MEDIUM })
  @IsOptional()
  @IsEnum(WorkOrderPriority)
  priority?: WorkOrderPriority;

  @ApiProperty({ enum: WorkOrderCategory, default: WorkOrderCategory.OTHER })
  @IsOptional()
  @IsEnum(WorkOrderCategory)
  category?: WorkOrderCategory;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  unitId?: string;

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
  @IsString()
  @MaxLength(255)
  reportedBy?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  estimatedCost?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  scheduledDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  actualCost?: number;

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
