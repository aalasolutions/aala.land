import { IsString, IsUUID, IsOptional, IsObject, IsEnum, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { AuditAction } from './query-audit-logs.dto';

export class CreateAuditLogDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  companyId: string;

  @ApiProperty({ format: 'uuid', required: false })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiProperty({ enum: AuditAction })
  @IsEnum(AuditAction)
  action: AuditAction;

  @ApiProperty()
  @IsString()
  @MaxLength(100)
  entityType: string;

  @ApiProperty({ format: 'uuid', required: false })
  @IsOptional()
  @IsUUID()
  entityId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  oldValue?: Record<string, any>;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  newValue?: Record<string, any>;

  @ApiProperty({ required: false, maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  ipAddress?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  userAgent?: string;
}
