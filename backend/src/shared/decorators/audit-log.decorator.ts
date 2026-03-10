import { SetMetadata } from '@nestjs/common';
import { AuditAction } from '../../modules/audit/dto/query-audit-logs.dto';

export const AUDIT_LOG_KEY = 'auditLog';

export const AuditLog = (action: AuditAction, entityType: string) =>
  SetMetadata(AUDIT_LOG_KEY, { action, entityType });
