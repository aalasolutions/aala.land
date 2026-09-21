import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
  Optional,
} from '@nestjs/common';
import { Observable, from, switchMap, tap } from 'rxjs';
import { DataSource } from 'typeorm';
import { AuditService } from './audit.service';
import { isGlobalEntityType } from './audit-global-entities';
import { oldValueSourceFor } from './audit-old-value-entities';
import { AuditAction } from './dto/query-audit-logs.dto';
import { NO_REGION_SENTINEL } from '@shared/interceptors/region-scope.interceptor';
import { seesAllRegions } from '@shared/utils/region-visibility.util';
import { errorMessage } from '@shared/utils/error.util';

interface AuditRequestContext {
  query?: Record<string, unknown>;
  user?: { role?: string };
}

// billing/webhook skipped: billing module already persists every event in stripe_events.
const SKIP_SEGMENTS = ['auth/refresh', 'health', 'docs', 'billing/webhook'];

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
  deactivate: AuditAction.UPDATE,
  reactivate: AuditAction.UPDATE,
  delete: AuditAction.DELETE,
  archive: AuditAction.UPDATE,
  unarchive: AuditAction.UPDATE,
  'trim-to-one': AuditAction.BULK_UPDATE,
};

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

  constructor(
    private readonly auditService: AuditService,
    @Optional() private readonly dataSource?: DataSource,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const method = request.method;

    if (!['POST', 'PATCH', 'DELETE'].includes(method)) {
      return next.handle();
    }

    const rawPath: string = request.path || request.url || '';
    const path = rawPath.replace(/^\/v1\//, '/').replace(/^\/+/, '');

    if (SKIP_SEGMENTS.some((skip) => path.startsWith(skip))) {
      return next.handle();
    }

    const segments = path.split('/').filter(Boolean);
    if (segments.length === 0) {
      return next.handle();
    }

    const baseSegment = segments[0];
    const entityType = ENTITY_TYPE_MAP[baseSegment] || baseSegment;
    const lastSegment = segments[segments.length - 1];
    const action = this.getAction(method, segments);

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

    const handleWithAudit = (oldValue?: Record<string, any>): Observable<any> =>
      next.handle().pipe(
        tap({
          next: (responseData) => {
            let logCompanyId = companyId;
            let logUserId = userId;
            let logEntityId = entityId;

            // Login: extract user info from response (may be wrapped by ResponseInterceptor)
            if (action === AuditAction.LOGIN) {
              const userData = responseData?.user || responseData?.data?.user;
              if (userData) {
                logCompanyId = userData.companyId;
                logUserId = userData.id;
                logEntityId = userData.id;
              }
            }

            if (!logCompanyId) {
              return;
            }

            if (!logEntityId) {
              const payload = responseData?.data || responseData;
              if (payload?.id) {
                logEntityId = payload.id;
              }
            }

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
                oldValue,
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
                regionCode: this.resolveRegionCode(
                  entityType,
                  request as AuditRequestContext,
                  responseData,
                ),
              })
              .catch((err: unknown) => {
                const message = errorMessage(err);
                this.logger.error(`Audit log failed: ${message}`);
              });
          },
        }),
      );

    // Opt-in only: an unconditional pre-read would add a query to every write in the app.
    const capturesOldValue =
      (action === AuditAction.UPDATE || action === AuditAction.DELETE) &&
      Boolean(entityId) &&
      Boolean(companyId) &&
      Boolean(oldValueSourceFor(entityType));

    if (!capturesOldValue) {
      return handleWithAudit();
    }

    // Read before the handler runs, otherwise the update has already overwritten the row.
    return from(this.readOldValue(entityType, entityId!, companyId)).pipe(
      switchMap((oldValue) => handleWithAudit(oldValue)),
    );
  }

  // Whitelisted table and columns only; the id and company are bound parameters.
  private async readOldValue(
    entityType: string,
    entityId: string,
    companyId: string,
  ): Promise<Record<string, any> | undefined> {
    const source = oldValueSourceFor(entityType);
    if (!source || !this.dataSource?.isInitialized) {
      return undefined;
    }

    const columns = Object.entries(source.fields)
      .map(([field, column]) => `"${column}" AS "${field}"`)
      .join(', ');

    try {
      const rows: unknown = await this.dataSource.query(
        `SELECT ${columns} FROM "${source.table}" WHERE "id" = $1 AND "company_id" = $2 LIMIT 1`,
        [entityId, companyId],
      );
      const row = Array.isArray(rows) ? rows[0] : undefined;
      return row ? (row as Record<string, any>) : undefined;
    } catch (err: unknown) {
      this.logger.warn(
        `Audit pre-read failed for ${entityType}: ${errorMessage(err)}`,
      );
      return undefined;
    }
  }

  // Admin requests carry no query.regionCode; the acted-on entity is the only source, may be NULL.
  private resolveRegionCode(
    entityType: string,
    request: AuditRequestContext,
    responseData: unknown,
  ): string | null | undefined {
    if (isGlobalEntityType(entityType)) {
      return null;
    }

    const entityRegion = this.entityRegionCode(responseData);
    if (entityRegion) {
      return entityRegion;
    }

    const requested = request.query?.regionCode;
    if (
      typeof requested === 'string' &&
      requested &&
      requested !== NO_REGION_SENTINEL
    ) {
      return requested;
    }

    const role = request.user?.role;
    return role && seesAllRegions(role) ? null : undefined;
  }

  // The response may be the entity itself or the ResponseInterceptor envelope around it.
  private entityRegionCode(responseData: unknown): string | undefined {
    const envelope = responseData as { data?: unknown } | null | undefined;
    const payload = (envelope?.data ?? responseData) as
      | { regionCode?: unknown }
      | null
      | undefined;
    const regionCode = payload?.regionCode;
    return typeof regionCode === 'string' && regionCode
      ? regionCode
      : undefined;
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
