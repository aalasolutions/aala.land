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

// The exchangeable code Meta hands back lives for 30 seconds, so every call on this path
// is short by nature. A request still hanging at 15s has already lost the code.
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

  // Both values are public: Meta requires them in the browser to launch the flow at all.
  // Served rather than baked into the frontend build so changing an app never needs a
  // frontend rebuild. Null means the UI keeps the Connect button disabled.
  getSignupConfig(): WaSignupConfig {
    return {
      appId: process.env.WHATSAPP_APP_ID?.trim() || null,
      configId: process.env.WHATSAPP_ES_CONFIG_ID?.trim() || null,
      graphVersion: GRAPH_VERSION,
    };
  }

  // The single write path for access_token_ciphertext. Order matters: the code dies in 30
  // seconds so it is exchanged first, the app is subscribed to the client's WABA before
  // anything is stored, and only a connection that can actually receive webhooks is saved.
  //
  // POST /{phone-number-id}/register is DELIBERATELY NOT CALLED. Meta instructs partners to
  // skip registration for Coexistence numbers because they are already registered, and the
  // call errors (docs/planning/WHATSAPP_REVISED.md, "Skip phone number registration").
  async connect(
    userId: string,
    companyId: string,
    dto: ConnectWhatsappDto,
  ): Promise<WaConnectionInfo> {
    const appId = process.env.WHATSAPP_APP_ID?.trim();
    const appSecret = process.env.WHATSAPP_APP_SECRET?.trim();
    if (!appId || !appSecret) {
      this.logger.error(
        'Embedded Signup attempted with WHATSAPP_APP_ID or WHATSAPP_APP_SECRET unset',
      );
      throw new ServiceUnavailableException(
        'WhatsApp signup is not configured on this server',
      );
    }

    // Proved with the real code path, and proved HERE. Discovering a bad key at the
    // encrypt call below would mean burning the 30-second code and subscribing to the
    // client's WABA first, leaving the agent to redo the whole Meta-hosted flow.
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

    // Deliberately NOT scoped by companyId: phone_number_id is the webhook routing key, so
    // two companies claiming one number would make inbound routing ambiguous. Scoped by
    // STATUS instead, mirroring the partial unique index: a DISCONNECTED row is history and
    // must not stop the next agent from connecting that number.
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
    await this.subscribeApp(dto.wabaId, token);
    const displayPhoneNumber = await this.verifyPhoneNumber(
      dto.wabaId,
      dto.phoneNumberId,
      token,
    );

    // Fails CLOSED: a bad or missing key throws here rather than storing a plaintext token.
    const ciphertext = this.encryption.encrypt(token);
    const now = new Date();

    const existing = await this.connections.findOne({
      where: { userId, companyId },
    });
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
        });
      }
    } catch (err) {
      // The `taken` pre-check above is read-then-write: a concurrent connect for the same
      // number or a double-submit for the same user can still pass it and only collide
      // here, after the code was spent and the WABA was subscribed. Map that unique
      // violation to a 409 instead of a raw 500; anything else is rethrown unchanged.
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

  // Row first: wa.disconnect flips status and wipes the token in one update, so a turn
  // already in flight cannot find this row CONNECTED while we talk to Meta below. The
  // token is decrypted before that call wipes it. Unsubscribing is best effort and runs
  // after the flip, only when no other agent's number still lives on that WABA.
  async disconnect(
    userId: string,
    companyId: string,
  ): Promise<{ success: boolean }> {
    const row = await this.connections.findOne({
      where: { userId, companyId },
    });
    const token = row
      ? this.encryption.decrypt(row.accessTokenCiphertext)
      : null;

    const result = await this.wa.disconnect(userId, companyId);

    if (row && token) {
      // A WABA's subscription is shared by every number on it (Meta has no per-number
      // unsubscribe), so unsubscribe only when this is the last live row on that WABA.
      const siblings = await this.connections.count({
        where: [
          {
            wabaId: row.wabaId,
            id: Not(row.id),
            status: WhatsappConnectionStatus.CONNECTED,
          },
          {
            wabaId: row.wabaId,
            id: Not(row.id),
            status: WhatsappConnectionStatus.FLAGGED,
          },
        ],
      });
      if (siblings === 0) {
        // Best effort by design: Meta refusing must not strand the agent in a connected
        // state they cannot leave. The row transition above is what the product acts on.
        await this.unsubscribeApp(row.wabaId, token);
      } else {
        this.logger.log(
          `Skipping unsubscribe for WABA ${row.wabaId}: ${siblings} other live connection(s) remain`,
        );
      }
    }

    if (row) {
      await this.connections.update(
        { id: row.id },
        { disconnectReason: 'SELF_DISCONNECTED' },
      );
    }
    return result;
  }

  // ── Graph calls ───────────────────────────────────────────────────────

  // Never log `code` or the returned token. A code is single-use and short-lived, a token
  // is a live credential for someone else's business.
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

  // Without this our webhook receives nothing for the client's WABA, so a connection that
  // skipped it would look healthy and silently never deliver a message.
  private async subscribeApp(wabaId: string, token: string): Promise<void> {
    const body = await this.graphFetch<{ success?: boolean }>(
      `https://graph.facebook.com/${GRAPH_VERSION}/${wabaId}/subscribed_apps`,
      { method: 'POST', headers: { Authorization: `Bearer ${token}` } },
      'app subscription',
    );
    // Meta answers this call with an explicit success flag, and a 200 carrying false would
    // otherwise be stored as a live connection that silently receives nothing. Fail closed:
    // a loud refusal to connect beats a number that looks healthy and never delivers.
    if (body?.success !== true) {
      this.logger.error(
        `Graph accepted the subscription for WABA ${wabaId} but did not confirm success`,
      );
      throw new BadGatewayException('WhatsApp app subscription was not confirmed');
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
        `Could not unsubscribe from WABA ${wabaId}; disconnecting locally anyway: ${errorMessage(err)}`,
      );
    }
  }

  // `phoneNumberId` arrives from the browser and is the webhook ROUTING KEY, so it must be
  // proven to sit on the WABA this token covers. Without that proof a caller could claim
  // another business's number: they would permanently block the real owner from connecting,
  // and inbound customer messages for that number would land in their chat list.
  // `subscribeApp` already proves the WABA (Meta 403s a WABA the token does not cover), so
  // listing that WABA's numbers is what closes the gap. The display number comes back on the
  // same call, which is why this replaced a separate cosmetic read.
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
