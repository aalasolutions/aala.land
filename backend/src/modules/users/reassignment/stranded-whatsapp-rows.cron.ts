import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { WhatsappSignupService } from '../../whatsapp/whatsapp-signup.service';
import { WhatsappConnectionStatus } from '../../whatsapp/entities/whatsapp-connection.entity';
import { errorMessage } from '@shared/utils/error.util';

// Must clear CONNECTED rows for departed users, or the webhook still spends credits on no one.
@Injectable()
export class StrandedWhatsappRowsCron {
  private readonly logger = new Logger(StrandedWhatsappRowsCron.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly whatsapp: WhatsappSignupService,
  ) {}

  @Cron('0 4 * * *')
  async run(): Promise<void> {
    const stranded = await this.findLiveConnectionsOfDepartedUsers();
    if (stranded.length === 0) return;

    for (const connection of stranded) {
      try {
        await this.whatsapp.disconnect(
          connection.userId,
          connection.companyId,
          'SEAT_REMOVED',
        );
        this.logger.log(
          `Disconnected a stranded WhatsApp number in company ${connection.companyId} for departed user ${connection.userId}`,
        );
      } catch (err) {
        this.logger.error(
          `Failed to disconnect the stranded WhatsApp number in company ${connection.companyId} for departed user ${connection.userId}; it may keep receiving and spending AI credits`,
          errorMessage(err),
        );
      }
    }
  }

  // Deleted users leave no row to join; deactivated ones have is_active false; both mean unowned.
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
