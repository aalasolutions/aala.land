import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { AuditService } from '../../modules/audit/audit.service';
import { AuditAction } from '../../modules/audit/dto/query-audit-logs.dto';

export interface AuditLogContext {
  action: AuditAction;
  entityType: string;
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(private readonly auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    const handler = context.getHandler();
    const auditMetadata = Reflect.getMetadata('auditLog', handler);

    if (!auditMetadata) {
      return next.handle();
    }

    const { action, entityType } = auditMetadata as AuditLogContext;
    const { user, body, params, method, ip, headers } = request;
    const userAgent = headers['user-agent'];

    let oldValue: Record<string, any> | undefined;
    let newValue: Record<string, any> | undefined;

    if (method === 'POST' || method === 'PATCH' || method === 'PUT') {
      newValue = { ...body };
      if (newValue && newValue.password) {
        delete newValue.password;
      }
    }

    if (params.id) {
      oldValue = { id: params.id };
    }

    return next.handle().pipe(
      tap((responseData) => {
        try {
          const entityId =
            responseData?.data?.id ||
            responseData?.id ||
            params.id;

          this.auditService
            .log({
              companyId: user?.companyId || '',
              userId: user?.id,
              action,
              entityType,
              entityId,
              oldValue,
              newValue: entityId ? { ...newValue, id: entityId } : newValue,
              ipAddress: ip,
              userAgent,
            })
            .catch((err) => {
              this.logger.error(`Failed to create audit log: ${err.message}`);
            });
        } catch (error) {
          this.logger.error(`Audit interceptor error: ${error.message}`);
        }
      }),
      catchError((error) => {
        try {
          this.auditService
            .log({
              companyId: user?.companyId || '',
              userId: user?.id,
              action: action === AuditAction.CREATE ? AuditAction.CREATE : action,
              entityType,
              entityId: params.id,
              oldValue,
              newValue: { ...newValue, error: error.message },
              ipAddress: ip,
              userAgent,
            })
            .catch((err) => {
              this.logger.error(`Failed to create audit log on error: ${err.message}`);
            });
        } catch (auditError) {
          this.logger.error(`Audit interceptor error handling: ${auditError.message}`);
        }
        throw error;
      }),
    );
  }
}
