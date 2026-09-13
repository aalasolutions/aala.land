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
} from './entities/whatsapp-connection.entity';
import { EncryptionService } from '../encryption/encryption.service';
import { WhatsappService } from './whatsapp.service';
import { ConnectWhatsappDto } from './dto/connect-whatsapp.dto';
import { GRAPH_VERSION, WaConnectionInfo, WaSignupConfig } from './wa-types';
import { errorMessage } from '@shared/utils/error.util';
import { envString } from '@shared/utils/env.util';

// The exchange code expires in 30s, so a request still running past 15s has already lost it.
const SIGNUP_TIMEOUT_MS = 15000;

// Unique indexes the insert/update below can race (see `connect`'s catch block).
const CONFLICT_MESSAGE_BY_CONSTRAINT: Record<string, string> = {
  UQ_wa_connections_phone_number_id:
    'That WhatsApp number is already connected to another account',
  UQ_wa_connections_user: 'A connection for this user is already being saved',
};

@Injectable()
export class WhatsappSignupService {
  private readonly logger = new Logger(WhatsappSignupService.name);

  constructor(
    @InjectRepository(WhatsappConnection)
    private readonly connections: Repository<WhatsappConnection>,
    private readonly encryption: EncryptionService,
    private readonly wa: WhatsappService,
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

    // Unscoped by companyId since phone_number_id is the webhook routing key; scoped by status instead.
    const taken = await this.connections.findOne({
      where: [
        {
          phoneNumberId: dto.phoneNumberId,
          userId: Not(userId),
          status: WhatsappConnectionStatus.CONNECTED,
        },
        {
          phoneNumberId: dto.phoneNumberId,
          userId: Not(userId),
          status: WhatsappConnectionStatus.FLAGGED,
        },
      ],
      select: { id: true },
    });
    if (taken) {
      throw new ConflictException(
        'That WhatsApp number is already connected to another account',
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

    if (row && token) {
      await this.unsubscribeIfLastLive(row.id, row.wabaId, token);
    }

    if (row) {
      await this.connections.update(
        { id: row.id },
        { disconnectReason: reason },
      );
    }
    return result;
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

    const body = await this.graphFetch<{ access_token?: string }>(
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
    const body = await this.graphFetch<{ success?: boolean }>(
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
      await this.graphFetch(
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
    const body = await this.graphFetch<{
      data?: { id?: string; display_phone_number?: string }[];
    }>(
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

  private async graphFetch<T>(
    url: string,
    init: RequestInit,
    label: string,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SIGNUP_TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      if (!res.ok) {
        const raw = await res.text();
        // The URL is never logged: for the exchange it carries the code and the app secret.
        this.logger.error(
          `Graph ${label} failed ${res.status}: ${raw.slice(0, 500)}`,
        );
        throw new BadGatewayException(`WhatsApp ${label} failed`);
      }
      return (await res.json()) as T;
    } catch (err) {
      if (err instanceof BadGatewayException) throw err;
      const reason = errorMessage(err);
      this.logger.error(`Graph ${label} error: ${reason}`);
      throw new BadGatewayException(`WhatsApp ${label} error`);
    } finally {
      clearTimeout(timer);
    }
  }
}
