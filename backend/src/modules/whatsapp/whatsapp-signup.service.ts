// backend/src/modules/whatsapp/whatsapp-signup.service.ts
import {
  BadGatewayException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, QueryFailedError, Repository } from 'typeorm';
import {
  WhatsappConnection,
  WhatsappConnectionStatus,
  WhatsappHistorySyncStatus,
} from './entities/whatsapp-connection.entity';
import { EncryptionService } from '../encryption/encryption.service';
import { WhatsappService } from './whatsapp.service';
import { WhatsappMediaService } from './whatsapp-media.service';
import { WhatsappDiagnosticsService } from './whatsapp-diagnostics.service';
import { ConnectWhatsappDto } from './dto/connect-whatsapp.dto';
import { User } from '../users/entities/user.entity';
import { GRAPH_VERSION, WaConnectionInfo, WaSignupConfig } from './wa-types';
import { graphFetch } from './wa-graph.util';
import { errorMessage } from '@shared/utils/error.util';
import { envString } from '@shared/utils/env.util';

// Nothing about a holder in another company is revealed.
const NUMBER_TAKEN_ELSEWHERE_MESSAGE =
  'This number is already connected in AALA.LAND to another account. Please contact support.';

const numberTakenInCompanyMessage = (holderName: string): string =>
  `This number is already connected in AALA.LAND to ${holderName}. Ask them to disconnect it first.`;

const PHONE_NUMBER_CONSTRAINT = 'UQ_wa_connections_phone_number_id';

// Unique indexes the insert/update below can race (see `connect`'s catch block).
const CONFLICT_MESSAGE_BY_CONSTRAINT: Record<string, string> = {
  UQ_wa_connections_user: 'A connection for this user is already being saved',
};

type NumberHolder = Pick<WhatsappConnection, 'userId' | 'companyId'>;

@Injectable()
export class WhatsappSignupService {
  private readonly logger = new Logger(WhatsappSignupService.name);

  constructor(
    @InjectRepository(WhatsappConnection)
    private readonly connections: Repository<WhatsappConnection>,
    private readonly encryption: EncryptionService,
    private readonly wa: WhatsappService,
    private readonly media: WhatsappMediaService,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly diagnostics: WhatsappDiagnosticsService,
  ) {}

  // Both values are public; served here so a config change never needs a frontend rebuild.
  getSignupConfig(): WaSignupConfig {
    return {
      appId: envString('WHATSAPP_APP_ID') || null,
      configId: envString('WHATSAPP_ES_CONFIG_ID') || null,
      graphVersion: GRAPH_VERSION,
    };
  }

  // POST /register is deliberately skipped: Meta already treats Coexistence numbers as registered.
  async connect(
    userId: string,
    companyId: string,
    dto: ConnectWhatsappDto,
  ): Promise<WaConnectionInfo> {
    const appId = envString('WHATSAPP_APP_ID');
    const appSecret = envString('WHATSAPP_APP_SECRET');
    if (!appId || !appSecret) {
      this.logger.error(
        'Embedded Signup attempted with WHATSAPP_APP_ID or WHATSAPP_APP_SECRET unset',
      );
      throw new ServiceUnavailableException(
        'WhatsApp signup is not configured on this server',
      );
    }

    // Probed here so a bad encryption key fails before burning the 30s code and subscribing the WABA.
    try {
      this.encryption.encrypt('probe');
    } catch {
      this.logger.error(
        'Embedded Signup attempted with an unusable WHATSAPP_TOKEN_ENC_KEY',
      );
      throw new ServiceUnavailableException(
        'WhatsApp signup is not configured on this server',
      );
    }

    const holder = await this.findNumberHolder(dto.phoneNumberId, userId);
    if (holder) {
      return this.refuseNumberTaken(
        dto.phoneNumberId,
        userId,
        companyId,
        holder,
        'pre-check',
      );
    }

    const token = await this.exchangeCode(dto.code, appId, appSecret);
    // Side-effect free check first, so a rejected number never leaves the WABA subscribed.
    const displayPhoneNumber = await this.verifyPhoneNumber(
      dto.wabaId,
      dto.phoneNumberId,
      token,
    );
    await this.subscribeApp(dto.wabaId, token);

    // Fails CLOSED: a bad or missing key throws here rather than storing a plaintext token.
    const ciphertext = this.encryption.encrypt(token);
    const now = new Date();

    const existing = await this.connections.findOne({
      where: { userId, companyId },
    });
    // Captured before the write: the old token is the only credential able to unsubscribe the old WABA.
    const previous =
      existing?.accessTokenCiphertext && existing.wabaId !== dto.wabaId
        ? {
            wabaId: existing.wabaId,
            token: this.encryption.decrypt(existing.accessTokenCiphertext),
          }
        : null;
    try {
      if (existing) {
        await this.connections.update(
          { id: existing.id },
          {
            wabaId: dto.wabaId,
            phoneNumberId: dto.phoneNumberId,
            displayPhoneNumber,
            status: WhatsappConnectionStatus.CONNECTED,
            accessTokenCiphertext: ciphertext,
            tokenUpdatedAt: now,
            connectedAt: now,
            disconnectedAt: null,
            disconnectReason: null,
            // Millisecond stamp refuses any Meta lifecycle event from before this connect.
            lifecycleEventAt: now,
            // A different number starts with no history state of its own.
            ...(existing.phoneNumberId !== dto.phoneNumberId && {
              historySyncStatus: null,
              historySyncProgress: null,
              historySyncRequestedAt: null,
            }),
          },
        );
      } else {
        await this.connections.insert({
          companyId,
          userId,
          wabaId: dto.wabaId,
          phoneNumberId: dto.phoneNumberId,
          displayPhoneNumber,
          status: WhatsappConnectionStatus.CONNECTED,
          accessTokenCiphertext: ciphertext,
          tokenUpdatedAt: now,
          connectedAt: now,
          lifecycleEventAt: now,
        });
      }
    } catch (err) {
      // Pre-check is read-then-write; a concurrent connect can still collide here, mapped to a 409.
      if (err instanceof QueryFailedError) {
        const driverError = err.driverError as
          | { code?: string; constraint?: string }
          | undefined;
        if (
          driverError?.code === '23505' &&
          driverError.constraint === PHONE_NUMBER_CONSTRAINT
        ) {
          const raceHolder = await this.findNumberHolder(
            dto.phoneNumberId,
            userId,
          ).catch((lookupErr: unknown) => {
            this.logger.warn(
              `Holder lookup failed after a number race: ${errorMessage(lookupErr)}`,
            );
            return null;
          });
          return this.refuseNumberTaken(
            dto.phoneNumberId,
            userId,
            companyId,
            raceHolder,
            'race',
          );
        }
        const message = driverError?.constraint
          ? CONFLICT_MESSAGE_BY_CONSTRAINT[driverError.constraint]
          : undefined;
        if (driverError?.code === '23505' && message) {
          throw new ConflictException(message);
        }
      }
      throw err;
    }

    if (existing && previous) {
      if (!previous.token) {
        this.logger.warn(
          `Could not read the previous token; WABA ${previous.wabaId} left subscribed`,
        );
      } else {
        try {
          await this.unsubscribeIfLastLive(
            existing.id,
            previous.wabaId,
            previous.token,
          );
        } catch (err) {
          this.logger.warn(
            `Could not unsubscribe previous WABA ${previous.wabaId}: ${errorMessage(err)}`,
          );
        }
      }
    }

    this.logger.log(
      `WhatsApp connected for user ${userId}: phone_number_id ${dto.phoneNumberId} on WABA ${dto.wabaId}`,
    );
    await this.media.resumePendingMedia(companyId, userId);

    if (dto.isCoexistence) {
      await this.requestHistorySync(
        userId,
        companyId,
        dto.phoneNumberId,
        token,
        existing?.phoneNumberId === dto.phoneNumberId ? existing : null,
      );
    }

    const info = await this.wa.getConnection(userId, companyId);
    if (!info) {
      throw new InternalServerErrorException(
        'Connection saved but could not be read back',
      );
    }
    return info;
  }

  // Row is flipped and token wiped before contacting Meta so no in-flight turn sees it as live.
  async disconnect(
    userId: string,
    companyId: string,
    reason = 'SELF_DISCONNECTED',
  ): Promise<{ success: boolean }> {
    // Best effort: a failed read must not stop the local disconnect below.
    const row = await this.connections
      .findOne({ where: { userId, companyId } })
      .catch((err: unknown) => {
        this.logger.warn(
          `Could not read the WhatsApp connection before disconnecting user ${userId}; Meta unsubscribe skipped: ${errorMessage(err)}`,
        );
        return null;
      });
    const token = row
      ? this.encryption.decrypt(row.accessTokenCiphertext)
      : null;

    const result = await this.wa.disconnect(userId, companyId);

    // Before the unsubscribe below, so the check shows Meta's state as the agent left it.
    const snapshot = row
      ? await this.diagnostics.captureDisconnectSnapshot(row, token, reason)
      : null;

    if (row && token) {
      await this.unsubscribeIfLastLive(row.id, row.wabaId, token);
    }

    if (row) {
      await this.connections.update(
        { id: row.id },
        { disconnectReason: reason, disconnectSnapshot: snapshot },
      );
    }
    return result;
  }

  // Unscoped by companyId since phone_number_id is the webhook routing key; scoped by status instead.
  private findNumberHolder(
    phoneNumberId: string,
    userId: string,
  ): Promise<NumberHolder | null> {
    return this.connections.findOne({
      where: [
        {
          phoneNumberId,
          userId: Not(userId),
          status: WhatsappConnectionStatus.CONNECTED,
        },
        {
          phoneNumberId,
          userId: Not(userId),
          status: WhatsappConnectionStatus.FLAGGED,
        },
      ],
      select: { id: true, userId: true, companyId: true },
    });
  }

  // Names the holder only inside the caller's own company.
  private async refuseNumberTaken(
    phoneNumberId: string,
    userId: string,
    companyId: string,
    holder: NumberHolder | null,
    path: 'pre-check' | 'race',
  ): Promise<never> {
    this.logger.warn(
      `WhatsApp number refused (${path}): phone_number_id ${phoneNumberId} requested by user ${userId} in company ${companyId}; held by user ${holder?.userId ?? 'unknown'} in company ${holder?.companyId ?? 'unknown'}; reason: number held by another live connection`,
    );
    if (holder && holder.companyId === companyId) {
      const holderUser = await this.users
        .findOne({
          where: { id: holder.userId, companyId },
          select: { id: true, name: true },
        })
        .catch((lookupErr: unknown) => {
          this.logger.warn(
            `Holder name lookup failed for user ${holder.userId}: ${errorMessage(lookupErr)}`,
          );
          return null;
        });
      const holderName = holderUser?.name?.trim();
      if (holderName) {
        throw new ConflictException(numberTakenInCompanyMessage(holderName));
      }
    }
    throw new ConflictException(NUMBER_TAKEN_ELSEWHERE_MESSAGE);
  }

  // Never log code or the returned token: a live credential for someone else's business.
  private async exchangeCode(
    code: string,
    appId: string,
    appSecret: string,
  ): Promise<string> {
    const url = new URL(
      `https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`,
    );
    url.searchParams.set('client_id', appId);
    url.searchParams.set('client_secret', appSecret);
    url.searchParams.set('code', code);

    const body = await graphFetch<{ access_token?: string }>(
      this.logger,
      url.toString(),
      { method: 'GET' },
      'token exchange',
    );
    const token = body.access_token;
    if (!token) {
      this.logger.error('Token exchange returned no access_token');
      throw new BadGatewayException('Meta returned no access token');
    }
    return token;
  }

  // Without this the webhook receives nothing for the WABA and looks healthy while never delivering.
  private async subscribeApp(wabaId: string, token: string): Promise<void> {
    const body = await graphFetch<{ success?: boolean }>(
      this.logger,
      `https://graph.facebook.com/${GRAPH_VERSION}/${wabaId}/subscribed_apps`,
      { method: 'POST', headers: { Authorization: `Bearer ${token}` } },
      'app subscription',
    );
    // Meta can return success false in a 200; fail closed rather than store a silently dead connection.
    if (body?.success !== true) {
      this.logger.error(
        `Graph accepted the subscription for WABA ${wabaId} but did not confirm success`,
      );
      throw new BadGatewayException('WhatsApp app subscription was not confirmed');
    }
  }

  // Meta allows this once per onboarding, within 24h of it; a refusal restores the previous state, never throws.
  private async requestHistorySync(
    userId: string,
    companyId: string,
    phoneNumberId: string,
    token: string,
    previous: WhatsappConnection | null,
  ): Promise<void> {
    // Recorded first, so an early history chunk is never reset by this write.
    await this.setHistorySyncStatus(
      userId,
      companyId,
      WhatsappHistorySyncStatus.REQUESTED,
      { historySyncProgress: null, historySyncRequestedAt: new Date() },
    );
    const isAccepted = await this.postHistorySyncRequest(phoneNumberId, token);
    if (isAccepted) return;
    // A re-auth of an already synced number is refused by Meta; it keeps its earlier result.
    const previousStatus = previous?.historySyncStatus ?? null;
    const isSettled =
      previousStatus === WhatsappHistorySyncStatus.COMPLETE ||
      previousStatus === WhatsappHistorySyncStatus.DECLINED;
    await this.setHistorySyncStatus(
      userId,
      companyId,
      isSettled && previousStatus
        ? previousStatus
        : WhatsappHistorySyncStatus.FAILED,
      isSettled
        ? {
            historySyncProgress: previous?.historySyncProgress ?? null,
            historySyncRequestedAt: previous?.historySyncRequestedAt ?? null,
          }
        : {},
      WhatsappHistorySyncStatus.REQUESTED,
    );
  }

  private async postHistorySyncRequest(
    phoneNumberId: string,
    token: string,
  ): Promise<boolean> {
    try {
      await graphFetch<{ success?: boolean }>(
        this.logger,
        `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/smb_app_data`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            sync_type: 'history',
          }),
        },
        'history sync request',
      );
      return true;
    } catch {
      return false;
    }
  }

  // Bookkeeping only: a failed write is logged and never fails the connect.
  private async setHistorySyncStatus(
    userId: string,
    companyId: string,
    status: WhatsappHistorySyncStatus,
    extra: Partial<WhatsappConnection>,
    onlyFrom?: WhatsappHistorySyncStatus,
  ): Promise<void> {
    const where = onlyFrom
      ? { userId, companyId, historySyncStatus: onlyFrom }
      : { userId, companyId };
    try {
      await this.connections.update(where, {
        historySyncStatus: status,
        ...extra,
      });
    } catch (err) {
      this.logger.warn(
        `Could not record history sync state for user ${userId}: ${errorMessage(err)}`,
      );
    }
  }

  // A WABA's subscription is shared by every number; unsubscribe only when this is the last live row.
  private async unsubscribeIfLastLive(
    rowId: string,
    wabaId: string,
    token: string,
  ): Promise<void> {
    const siblings = await this.connections.count({
      where: [
        {
          wabaId,
          id: Not(rowId),
          status: WhatsappConnectionStatus.CONNECTED,
        },
        {
          wabaId,
          id: Not(rowId),
          status: WhatsappConnectionStatus.FLAGGED,
        },
      ],
    });
    if (siblings === 0) {
      // Best effort: Meta refusing must not strand the agent in a state they can't leave.
      await this.unsubscribeApp(wabaId, token);
    } else {
      this.logger.log(
        `Skipping unsubscribe for WABA ${wabaId}: ${siblings} other live connection(s) remain`,
      );
    }
  }

  private async unsubscribeApp(wabaId: string, token: string): Promise<void> {
    try {
      await graphFetch(
        this.logger,
        `https://graph.facebook.com/${GRAPH_VERSION}/${wabaId}/subscribed_apps`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
        'app unsubscription',
      );
    } catch (err) {
      this.logger.warn(
        `Could not unsubscribe from WABA ${wabaId}; continuing locally anyway: ${errorMessage(err)}`,
      );
    }
  }

  // Verifies phoneNumberId sits on this WABA, or a caller could hijack another business's number.
  private async verifyPhoneNumber(
    wabaId: string,
    phoneNumberId: string,
    token: string,
  ): Promise<string> {
    const body = await graphFetch<{
      data?: { id?: string; display_phone_number?: string }[];
    }>(
      this.logger,
      `https://graph.facebook.com/${GRAPH_VERSION}/${wabaId}/phone_numbers`,
      { method: 'GET', headers: { Authorization: `Bearer ${token}` } },
      'phone number listing',
    );

    const match = (body?.data ?? []).find((n) => n.id === phoneNumberId);
    if (!match) {
      this.logger.error(
        `Rejected signup: phone_number_id ${phoneNumberId} is not on WABA ${wabaId}`,
      );
      throw new ForbiddenException(
        'That phone number does not belong to the connected WhatsApp Business Account',
      );
    }
    return match.display_phone_number ?? '';
  }
}
