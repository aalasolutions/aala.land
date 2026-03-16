import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { AuditService } from './audit.service';
import { AuditAction } from './dto/query-audit-logs.dto';

// Path segments that should never be audited (matched against normalized path)
const SKIP_SEGMENTS = ['auth/refresh', 'health', 'docs'];

// Map special sub-paths to audit actions
const ACTION_OVERRIDES: Record<string, AuditAction> = {
  login: AuditAction.LOGIN,
  logout: AuditAction.LOGOUT,
  assign: AuditAction.ASSIGN,
  convert: AuditAction.ASSIGN,
  approve: AuditAction.UPDATE,
  pay: AuditAction.UPDATE,
  renew: AuditAction.CREATE,
  terminate: AuditAction.UPDATE,
  bounce: AuditAction.UPDATE,
  invite: AuditAction.CREATE,
  render: AuditAction.EXPORT,
  'bulk-import': AuditAction.IMPORT,
  read: AuditAction.UPDATE,
  'read-all': AuditAction.BULK_UPDATE,
  'forgot-password': AuditAction.UPDATE,
  'reset-password': AuditAction.UPDATE,
  send: AuditAction.CREATE,
};

// Map URL segments to clean entity type names
const ENTITY_TYPE_MAP: Record<string, string> = {
  leads: 'Lead',
  properties: 'Property',
  users: 'User',
  companies: 'Company',
  leases: 'Lease',
  cheques: 'Cheque',
  commissions: 'Commission',
  financial: 'Transaction',
  transactions: 'Transaction',
  maintenance: 'WorkOrder',
  whatsapp: 'WhatsApp',
  notifications: 'Notification',
  contacts: 'Contact',
  'email-templates': 'EmailTemplate',
  vendors: 'Vendor',
  owners: 'Owner',
  'audit-logs': 'AuditLog',
  'reminder-rules': 'ReminderRule',
  documents: 'Document',
  reports: 'Report',
  auth: 'Auth',
};

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(private readonly auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const method = request.method;

    // Only audit mutations (POST, PATCH, DELETE)
    if (!['POST', 'PATCH', 'DELETE'].includes(method)) {
      return next.handle();
    }

    const rawPath: string = request.path || request.url || '';
    // Normalize: strip /v1/ prefix and leading slashes
    const path = rawPath.replace(/^\/v1\//, '/').replace(/^\/+/, '');

    // Skip internal paths
    if (SKIP_SEGMENTS.some((skip) => path.startsWith(skip))) {
      return next.handle();
    }

    // Parse segments
    const segments = path.split('/').filter(Boolean);
    if (segments.length === 0) {
      return next.handle();
    }

    const baseSegment = segments[0];
    const entityType = ENTITY_TYPE_MAP[baseSegment] || baseSegment;
    const lastSegment = segments[segments.length - 1];
    const action = this.getAction(method, segments);

    // Extract entity ID (first UUID found after the base segment)
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let entityId: string | undefined;
    for (let i = 1; i < segments.length; i++) {
      if (uuidRegex.test(segments[i])) {
        entityId = segments[i];
        break;
      }
    }

    // User context from JWT (absent for login, forgot-password, reset-password)
    const user = request.user;
    const companyId = user?.companyId;
    const userId = user?.userId;

    // Sanitize request body (never log secrets)
    const body = request.body ? { ...request.body } : undefined;
    if (body) {
      delete body.password;
      delete body.currentPassword;
      delete body.newPassword;
      delete body.accessToken;
      delete body.refreshToken;
      delete body.token;
    }

    const ipAddress =
      request.headers['x-forwarded-for'] ||
      request.connection?.remoteAddress ||
      request.ip;
    const userAgent = request.headers['user-agent'];

    return next.handle().pipe(
      tap({
        next: (responseData) => {
          let logCompanyId = companyId;
          let logUserId = userId;
          let logEntityId = entityId;

          // Login: extract user info from response (may be wrapped by ResponseInterceptor)
          if (action === AuditAction.LOGIN) {
            const userData =
              responseData?.user || responseData?.data?.user;
            if (userData) {
              logCompanyId = userData.companyId;
              logUserId = userData.id;
              logEntityId = userData.id;
            }
          }

          // Skip if no company context
          if (!logCompanyId) {
            return;
          }

          // Extract entity ID from response for CREATE actions
          if (!logEntityId) {
            const payload = responseData?.data || responseData;
            if (payload?.id) {
              logEntityId = payload.id;
            }
          }

          // Include sub-action detail when applicable
          const actionDetail =
            ACTION_OVERRIDES[lastSegment] && segments.length > 1
              ? lastSegment
              : undefined;

          // Fire and forget (never block the response)
          this.auditService
            .log({
              companyId: logCompanyId,
              userId: logUserId || undefined,
              action,
              entityType,
              entityId: logEntityId,
              oldValue: undefined,
              newValue: body
                ? {
                    ...body,
                    ...(actionDetail ? { _action: actionDetail } : {}),
                  }
                : undefined,
              ipAddress:
                typeof ipAddress === 'string'
                  ? ipAddress.substring(0, 100)
                  : undefined,
              userAgent: userAgent || undefined,
            })
            .catch((err: unknown) => {
              const message = err instanceof Error ? err.message : String(err);
              this.logger.error(`Audit log failed: ${message}`);
            });
        },
      }),
    );
  }

  private getAction(method: string, segments: string[]): AuditAction {
    const lastSegment = segments[segments.length - 1];
    if (ACTION_OVERRIDES[lastSegment]) {
      return ACTION_OVERRIDES[lastSegment];
    }

    switch (method) {
      case 'POST':
        return AuditAction.CREATE;
      case 'PATCH':
        return AuditAction.UPDATE;
      case 'DELETE':
        return AuditAction.DELETE;
      default:
        return AuditAction.UPDATE;
    }
  }
}
