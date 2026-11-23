// backend/src/modules/whatsapp/whatsapp-diagnostics.service.ts
import { HttpException, Injectable, Logger } from '@nestjs/common';
import { WhatsappConnection } from './entities/whatsapp-connection.entity';
import { MessageStoreService } from './message-store.service';
import { GRAPH_VERSION, WaDisconnectSnapshot } from './wa-types';
import { graphFetch } from './wa-graph.util';
import { errorMessage } from '@shared/utils/error.util';
import { envString } from '@shared/utils/env.util';

@Injectable()
export class WhatsappDiagnosticsService {
  private readonly logger = new Logger(WhatsappDiagnosticsService.name);

  constructor(private readonly store: MessageStoreService) {}

  // Never throws: evidence gathering must not stop a disconnect.
  async captureDisconnectSnapshot(
    row: WhatsappConnection,
    token: string | null,
    reason: string,
  ): Promise<WaDisconnectSnapshot> {
    const [times, subscription] = await Promise.all([
      this.store
        .getLastMessageTimes(row.companyId, row.userId)
        .catch((err: unknown) => {
          this.logger.warn(
            `Could not read last message times for the disconnect snapshot of user ${row.userId}: ${errorMessage(err)}`,
          );
          return null;
        }),
      this.checkSubscription(row.wabaId, token),
    ]);
    const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
    return {
      capturedAt: new Date().toISOString(),
      reason,
      status: row.status,
      wabaId: row.wabaId,
      phoneNumberId: row.phoneNumberId,
      connectedAt: iso(row.connectedAt),
      lifecycleEventAt: iso(row.lifecycleEventAt),
      tokenUpdatedAt: iso(row.tokenUpdatedAt),
      previousDisconnectReason: row.disconnectReason ?? null,
      lastInboundAt: iso(times?.lastInboundAt),
      lastOutboundAt: iso(times?.lastOutboundAt),
      subscription,
    };
  }

  private async checkSubscription(
    wabaId: string,
    token: string | null,
  ): Promise<WaDisconnectSnapshot['subscription']> {
    if (!token) {
      return {
        attempted: false,
        appSubscribed: null,
        subscribedAppIds: [],
        error: 'No readable stored token',
      };
    }
    try {
      const body = await graphFetch<{
        data?: { whatsapp_business_api_data?: { id?: string } }[];
      }>(
        this.logger,
        `https://graph.facebook.com/${GRAPH_VERSION}/${wabaId}/subscribed_apps`,
        { method: 'GET', headers: { Authorization: `Bearer ${token}` } },
        'subscription check',
      );
      const ids = (body?.data ?? [])
        .map((app) => app.whatsapp_business_api_data?.id)
        .filter((id): id is string => typeof id === 'string');
      const appId = envString('WHATSAPP_APP_ID');
      return {
        attempted: true,
        appSubscribed: appId ? ids.includes(appId) : null,
        subscribedAppIds: ids,
        error: null,
      };
    } catch (err) {
      const detail =
        err instanceof HttpException && typeof err.cause === 'string'
          ? `${err.message}: ${err.cause}`
          : errorMessage(err);
      return {
        attempted: true,
        appSubscribed: null,
        subscribedAppIds: [],
        error: detail,
      };
    }
  }
}
