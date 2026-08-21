import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { Role } from '@shared/enums/roles.enum';
import { MessageStoreService } from '../../whatsapp/message-store.service';
import { UserReassignmentService } from './user-reassignment.service';

// Ordered: COMPANY_ADMIN preferred, ADMIN as fallback.
const RECIPIENT_ROLES = [Role.COMPANY_ADMIN, Role.ADMIN];

/**
 * Recovers the rows left on a user who is gone or deactivated after a removal.
 * Nothing reads those rows, so the loss is otherwise silent.
 * Assumes a single scheduler instance, as the other crons do.
 */
@Injectable()
export class StrandedWhatsappRowsCron {
  private readonly logger = new Logger(StrandedWhatsappRowsCron.name);
  private warnedNoRecipient = new Set<string>();

  constructor(
    private readonly dataSource: DataSource,
    private readonly messageStore: MessageStoreService,
    private readonly reassignment: UserReassignmentService,
  ) {}

  @Cron('0 4 * * *')
  async run(): Promise<void> {
    const stranded = await this.messageStore.findOwnersNeedingRecovery();
    if (stranded.length === 0) return;

    for (const owner of stranded) {
      try {
        const recipient = await this.findRecipient(owner.companyId);
        if (!recipient) {
          // Warn once per boot: the condition is permanent and would drown the errors below.
          if (!this.warnedNoRecipient.has(owner.companyId)) {
            this.warnedNoRecipient.add(owner.companyId);
            this.logger.warn(
              `Company ${owner.companyId} has stranded WhatsApp rows on user ${owner.userId} but no active company admin or admin to receive them`,
            );
          }
          continue;
        }
        this.warnedNoRecipient.delete(owner.companyId);

        const moved = await this.reassignment.reassignWhatsappRows(
          owner.companyId,
          owner.userId,
          recipient,
        );
        if (moved.messages > 0 || moved.chats > 0) {
          this.logger.log(
            `Recovered stranded WhatsApp rows in company ${owner.companyId} from ${owner.userId} to ${recipient}: chats=${moved.chats}, messages=${moved.messages}`,
          );
        }
      } catch (err) {
        this.logger.error(
          `Failed to recover stranded WhatsApp rows in company ${owner.companyId} from user ${owner.userId}`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  }

  private async findRecipient(companyId: string): Promise<string | null> {
    const [recipient]: Array<{ id: string }> = await this.dataSource.query(
      `SELECT "id" FROM "users"
        WHERE "company_id" = $1 AND "role"::text = ANY($2::text[]) AND "is_active" = true
        ORDER BY array_position($2::text[], "role"::text), "created_at" ASC
        LIMIT 1`,
      [companyId, RECIPIENT_ROLES],
    );
    return recipient?.id ?? null;
  }
}
