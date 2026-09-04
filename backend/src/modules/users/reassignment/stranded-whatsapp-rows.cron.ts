import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { WhatsappService } from '../../whatsapp/whatsapp.service';
import { WhatsappConnectionStatus } from '../../whatsapp/entities/whatsapp-connection.entity';

// Chats and messages left on a departed agent are the intended end state now, not damage: what must never be left behind is a CONNECTED row, because the webhook routes on it and every inbound message could still open an AI credit window for a seat nobody holds.
// Removal only logs when its disconnect fails, so re-running that disconnect is the whole job here. Assumes a single scheduler instance, as the other crons do.
@Injectable()
export class StrandedWhatsappRowsCron {
  private readonly logger = new Logger(StrandedWhatsappRowsCron.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly whatsapp: WhatsappService,
  ) {}

  @Cron('0 4 * * *')
  async run(): Promise<void> {
    const stranded = await this.findLiveConnectionsOfDepartedUsers();
    if (stranded.length === 0) return;

    for (const connection of stranded) {
      try {
        // Same call the removal path uses: DISCONNECTED row plus the queued AI turns.
        await this.whatsapp.disconnect(connection.userId, connection.companyId);
        this.logger.log(
          `Disconnected a stranded WhatsApp number in company ${connection.companyId} for departed user ${connection.userId}`,
        );
      } catch (err) {
        this.logger.error(
          `Failed to disconnect the stranded WhatsApp number in company ${connection.companyId} for departed user ${connection.userId}; it may keep receiving and spending AI credits`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  }

  // Deleted users leave no row to join, deactivated ones are is_active false; both mean
  // nobody holds this number any more.
  private async findLiveConnectionsOfDepartedUsers(): Promise<
    Array<{ companyId: string; userId: string }>
  > {
    const rows: Array<{ company_id: string; user_id: string }> =
      await this.dataSource.query(
        `SELECT c."company_id", c."user_id"
           FROM "whatsapp_connections" c
           LEFT JOIN "users" u ON u."id" = c."user_id"
          WHERE c."status" = $1
            AND (u."id" IS NULL OR u."is_active" = false)`,
        [WhatsappConnectionStatus.CONNECTED],
      );
    return rows.map((r) => ({ companyId: r.company_id, userId: r.user_id }));
  }
}
