import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  WhatsappConnection,
  WhatsappConnectionStatus,
} from './entities/whatsapp-connection.entity';
import { WhatsappMessageStatus } from './entities/whatsapp-message.entity';
import { WhatsappAiService } from './whatsapp-ai.service';
import { MessageStoreService } from './message-store.service';
import { WhatsappGateway } from './whatsapp.gateway';
import {
  WaMessage,
  WaWebhookJobData,
  WA_WEBHOOK_EVENTS_QUEUE,
} from './wa-types';
import { WebhookVerifyDto } from './dto/webhook-payload.dto';

interface CloudWebhookEnvelope {
  entry?: WebhookEntry[];
}

interface WebhookEntry {
  // The WABA id. It is the only routing key an account_update carries, because that
  // event has no metadata.phone_number_id.
  id?: string;
  changes?: WebhookChange[];
}

interface WebhookChange {
  field?: string;
  value?: WebhookValue;
}

interface WebhookValue {
  metadata?: { phone_number_id?: string };
  contacts?: { profile?: { name?: string }; wa_id?: string }[];
  messages?: CloudMessage[];
  statuses?: CloudStatus[];
  // account_update only.
  event?: string;
  phone_number?: string;
  disconnection_info?: { reason?: string; initiated_by?: string };
}

interface CloudMessage {
  id?: string;
  from?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
}

interface CloudStatus {
  id?: string;
  status?: string;
  timestamp?: string;
  errors?: { code?: number | string }[];
}

// WhatsappMessageStatus carries exactly the five strings Meta's status webhook sends.
const META_STATUSES = new Set<string>(Object.values(WhatsappMessageStatus));

@Injectable()
export class WhatsappWebhookService {
  private readonly logger = new Logger(WhatsappWebhookService.name);

  constructor(
    @InjectRepository(WhatsappConnection)
    private readonly connections: Repository<WhatsappConnection>,
    private readonly store: MessageStoreService,
    private readonly gateway: WhatsappGateway,
    private readonly ai: WhatsappAiService,
    @InjectQueue(WA_WEBHOOK_EVENTS_QUEUE)
    private readonly webhookQueue: Queue<WaWebhookJobData>,
  ) {}

  verifyWebhook(query: WebhookVerifyDto): string {
    const expected = process.env.WHATSAPP_VERIFY_TOKEN;
    if (!expected) {
      this.logger.error('WHATSAPP_VERIFY_TOKEN is not set; refusing handshake');
      throw new ForbiddenException();
    }
    if (
      query['hub.mode'] !== 'subscribe' ||
      query['hub.verify_token'] !== expected
    ) {
      throw new ForbiddenException();
    }
    return query['hub.challenge'];
  }

  // Fail closed: no app secret configured means no webhook is accepted. Past the
  // signature this only parses and enqueues, so Meta gets its 200 in milliseconds.
  async handleWebhook(
    rawBody: Buffer | undefined,
    signature: string | undefined,
  ): Promise<{ received: true }> {
    if (!rawBody || rawBody.length === 0) throw new BadRequestException();
    const appSecret = process.env.WHATSAPP_APP_SECRET;
    if (!appSecret) {
      this.logger.error('WHATSAPP_APP_SECRET is not set; rejecting webhook');
      throw new ForbiddenException();
    }
    if (!signature || !this.signatureMatches(rawBody, signature, appSecret)) {
      throw new ForbiddenException();
    }

    let envelope: unknown;
    try {
      envelope = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new BadRequestException();
    }

    // The only 5xx left on this route. Meta redelivers the envelope, which is the
    // correct recovery when the queue itself is unreachable.
    try {
      await this.webhookQueue.add('envelope', { envelope });
    } catch (err) {
      this.logger.error(
        'Failed to enqueue a WhatsApp webhook envelope',
        err instanceof Error ? (err.stack ?? err.message) : err,
      );
      throw new InternalServerErrorException();
    }
    return { received: true };
  }

  // Called by WhatsappWebhookProcessor, never inline. Retries are safe: message
  // processing dedupes on wamid and status persistence is a ranked idempotent update.
  async processEnvelope(body: unknown): Promise<void> {
    const envelope = (body ?? {}) as CloudWebhookEnvelope;

    // Siblings still run, then the first error is rethrown so BullMQ retries the envelope.
    let firstError: unknown = null;
    for (const entry of envelope.entry ?? []) {
      for (const change of entry.changes ?? []) {
        try {
          await this.dispatchValue(change.value ?? {}, change.field, entry.id);
        } catch (err) {
          firstError = firstError ?? err;
          this.logger.error(
            'Failed to process a WhatsApp webhook change',
            err instanceof Error ? (err.stack ?? err.message) : err,
          );
        }
      }
    }
    if (firstError) throw firstError;
  }

  private signatureMatches(
    rawBody: Buffer,
    signature: string,
    appSecret: string,
  ): boolean {
    if (!signature.startsWith('sha256=')) return false;
    const expected = createHmac('sha256', appSecret).update(rawBody).digest();
    const received = Buffer.from(signature.slice('sha256='.length), 'hex');
    if (received.length !== expected.length) return false;
    return timingSafeEqual(received, expected);
  }

  private async dispatchValue(
    value: WebhookValue,
    field?: string,
    wabaId?: string,
  ): Promise<void> {
    // account_update carries no phone_number_id, so it must branch off before the guard
    // below. Until this existed the event was dropped silently.
    if (field === 'account_update') {
      await this.handleAccountUpdate(value, wabaId);
      return;
    }

    const phoneNumberId = value.metadata?.phone_number_id;
    const messages = value.messages ?? [];
    const statuses = value.statuses ?? [];
    if (!phoneNumberId || (messages.length === 0 && statuses.length === 0)) {
      return;
    }

    // FLAGGED breaks outbound only and Meta keeps delivering inbound, so it is kept here.
    const connection = await this.connections.findOne({
      where: [
        { phoneNumberId, status: WhatsappConnectionStatus.CONNECTED },
        { phoneNumberId, status: WhatsappConnectionStatus.FLAGGED },
      ],
    });
    if (!connection) {
      this.logger.warn(
        `Webhook for unknown or disconnected phone_number_id ${phoneNumberId}`,
      );
      return;
    }

    // phone_number_id is supplied by the browser at signup, so on its own it is a claim, not
    // proof. entry.id is Meta's own statement of which WABA delivered this. A mismatch means
    // the stored row does not own this number, and routing it anyway would hand one tenant
    // another tenant's customer messages.
    if (wabaId && connection.wabaId !== wabaId) {
      this.logger.error(
        `Refusing webhook: phone_number_id ${phoneNumberId} is stored under WABA ${connection.wabaId} but was delivered by ${wabaId}`,
      );
      return;
    }

    if (statuses.length > 0) {
      await this.persistStatuses(connection, statuses);
    }
    if (messages.length > 0) {
      await this.dispatchMessages(connection, value, messages, phoneNumberId);
    }
  }

  // Meta surfaces every lifecycle change on this one field. Mapping is deliberately
  // explicit and an unrecognised event changes NOTHING: guessing a status from an unknown
  // string is how an agent silently loses their number.
  //
  // PARTNER_REMOVED is the disconnect event for all six documented reasons; the specific
  // one arrives in disconnection_info.reason. ACCOUNT_OFFBOARDED is a device change and
  // Meta documents it as self-healing, so it is treated as suspension (FLAGGED keeps
  // inbound flowing) rather than teardown.
  private async handleAccountUpdate(
    value: WebhookValue,
    wabaId: string | undefined,
  ): Promise<void> {
    const event = value.event;
    if (!wabaId || !event) {
      this.logger.warn('account_update with no WABA id or no event; ignored');
      return;
    }

    const connection = await this.findConnectionForAccountUpdate(
      wabaId,
      value.phone_number,
    );
    if (!connection) return;

    switch (event) {
      case 'PARTNER_ADDED': {
        // The row is created by the connect endpoint, so this normally confirms what we
        // already stored. It only matters when it beats us there.
        if (
          connection.status === WhatsappConnectionStatus.PENDING &&
          connection.accessTokenCiphertext
        ) {
          await this.connections.update(
            { id: connection.id },
            {
              status: WhatsappConnectionStatus.CONNECTED,
              connectedAt: new Date(),
              disconnectedAt: null,
              disconnectReason: null,
            },
          );
        }
        this.logger.log(
          `account_update PARTNER_ADDED for WABA ${wabaId} (${connection.phoneNumberId})`,
        );
        return;
      }
      case 'PARTNER_REMOVED': {
        const reason = value.disconnection_info?.reason ?? 'PARTNER_REMOVED';
        await this.connections.update(
          { id: connection.id },
          {
            status: WhatsappConnectionStatus.DISCONNECTED,
            disconnectedAt: new Date(),
            disconnectReason: reason.slice(0, 64),
          },
        );
        this.logger.warn(
          `WhatsApp connection ${connection.phoneNumberId} disconnected by Meta: ${reason}`,
        );
        return;
      }
      case 'ACCOUNT_OFFBOARDED': {
        await this.connections.update(
          { id: connection.id },
          {
            status: WhatsappConnectionStatus.FLAGGED,
            disconnectReason: 'ACCOUNT_OFFBOARDED',
          },
        );
        this.logger.warn(
          `WhatsApp connection ${connection.phoneNumberId} offboarded; awaiting ACCOUNT_RECONNECTED`,
        );
        return;
      }
      case 'ACCOUNT_RECONNECTED': {
        if (!connection.accessTokenCiphertext) {
          this.logger.warn(
            `ACCOUNT_RECONNECTED for ${connection.phoneNumberId} but no token is stored; the agent must reconnect`,
          );
          return;
        }
        await this.connections.update(
          { id: connection.id },
          {
            status: WhatsappConnectionStatus.CONNECTED,
            connectedAt: new Date(),
            disconnectedAt: null,
            disconnectReason: null,
          },
        );
        this.logger.log(
          `WhatsApp connection ${connection.phoneNumberId} reconnected`,
        );
        return;
      }
      default:
        this.logger.warn(
          `Unhandled account_update event "${event}" for WABA ${wabaId}; no status changed`,
        );
    }
  }

  // One WABA can host up to 20 numbers, so the WABA id alone is not unique to an agent.
  // display_phone_number formatting differs between Graph and the webhook, so the match is
  // on digits. With several numbers and no usable phone match we do nothing rather than
  // disconnect an arbitrary agent.
  private async findConnectionForAccountUpdate(
    wabaId: string,
    phoneNumber: string | undefined,
  ): Promise<WhatsappConnection | null> {
    const rows = await this.connections.find({ where: { wabaId } });
    if (rows.length === 0) {
      this.logger.warn(`account_update for unknown WABA ${wabaId}; ignored`);
      return null;
    }
    const digits = (v: string | undefined) => (v ?? '').replace(/\D/g, '');
    const wanted = digits(phoneNumber);

    if (rows.length === 1) {
      const only = rows[0];
      const stored = digits(only.displayPhoneNumber);
      // Only reject on a POSITIVE mismatch. A WABA hosts up to 20 numbers and we may hold
      // just one of them, so an event about a sibling number must not disconnect ours.
      // With either side unknown there is nothing to contradict, so the single row stands.
      if (wanted && stored && stored !== wanted) {
        this.logger.warn(
          `account_update for WABA ${wabaId} names a different number than the one connected; ignored`,
        );
        return null;
      }
      return only;
    }

    const match = wanted
      ? rows.find((r) => digits(r.displayPhoneNumber) === wanted)
      : undefined;
    if (!match) {
      this.logger.warn(
        `account_update for WABA ${wabaId} matched ${rows.length} connections and no phone number; ignored`,
      );
      return null;
    }
    return match;
  }

  // Persistence only. The live push to the page is Phase 6 emitStatus work.
  private async persistStatuses(
    connection: WhatsappConnection,
    statuses: CloudStatus[],
  ): Promise<void> {
    for (const status of statuses) {
      try {
        const value = status.status ?? '';
        if (!status.id || !META_STATUSES.has(value)) {
          this.logger.debug(
            `Skipping unusable status callback ${value || 'unknown'}`,
          );
          continue;
        }
        const mapped = value as WhatsappMessageStatus;
        const seconds = Number(status.timestamp);
        const statusAt =
          Number.isFinite(seconds) && seconds > 0
            ? new Date(seconds * 1000)
            : new Date();
        const failureCode = status.errors?.[0]?.code;
        const applied = await this.store.applyMessageStatus(
          connection.companyId,
          connection.userId,
          status.id,
          mapped,
          statusAt,
          mapped === WhatsappMessageStatus.FAILED && failureCode != null
            ? String(failureCode)
            : null,
        );
        if (!applied) {
          this.logger.debug(
            `Status ${mapped} not stored for ${status.id}: unknown message or a stale status`,
          );
        }
      } catch (err) {
        this.logger.error(
          `Failed to persist status callback for ${status.id ?? 'unknown'}`,
          err instanceof Error ? (err.stack ?? err.message) : err,
        );
      }
    }
  }

  private async dispatchMessages(
    connection: WhatsappConnection,
    value: WebhookValue,
    messages: CloudMessage[],
    phoneNumberId: string,
  ): Promise<void> {
    const names = new Map<string, string>();
    for (const contact of value.contacts ?? []) {
      if (contact.wa_id) names.set(contact.wa_id, contact.profile?.name ?? '');
    }

    for (const message of messages) {
      // One poisoned message must not cost us the rest of the batch.
      try {
        if (message.type !== 'text' || !message.id || !message.from) continue;
        const body = message.text?.body ?? '';
        if (!body.trim()) continue;

        // Cloud API sends seconds; handleIncomingMessage compares against seconds.
        const timestamp = Number(message.timestamp);
        if (!Number.isFinite(timestamp) || timestamp <= 0) {
          this.logger.warn(
            `Skipping message ${message.id} with a missing or non-numeric timestamp`,
          );
          continue;
        }

        const evt: WaMessage = {
          id: message.id,
          chatId: message.from,
          senderId: message.from,
          senderName: names.get(message.from) ?? '',
          chatName: names.get(message.from) ?? '',
          isGroup: false,
          body,
          hasMedia: false,
          mediaType: 'text',
          mediaUrls: [],
          mentionedIds: [],
          quotedParticipant: '',
          fromMe: false,
          aiGenerated: false,
          timestamp,
          originUserId: connection.userId,
        };

        // Same order as the old inbound flow: persist, emit to the live page, then AI.
        // A store outage still emits and dispatches: availability over consistency.
        let firstDelivery = true;
        try {
          firstDelivery = await this.store.addMessage(
            connection.companyId,
            connection.userId,
            evt,
            phoneNumberId,
          );
        } catch (err) {
          this.logger.error(
            `Failed to persist WhatsApp message ${evt.id}`,
            err instanceof Error ? err.message : err,
          );
        }
        if (!firstDelivery) {
          // Meta redelivers for up to 7 days; a stored message must not start a second turn.
          this.logger.debug(`Skipping redelivered WhatsApp message ${evt.id}`);
          continue;
        }

        this.gateway.emitMessage(connection.userId, evt);
        // A flagged token cannot send, so an AI turn would only burn a credit on a failure.
        if (connection.status !== WhatsappConnectionStatus.CONNECTED) {
          this.logger.debug(
            `Skipping the AI turn for ${evt.id}: connection is ${connection.status}`,
          );
          continue;
        }
        await this.ai.handleIncomingMessage(
          evt,
          connection.companyId,
          connection.userId,
        );
      } catch (err) {
        this.logger.error(
          `Failed to process WhatsApp message ${message.id ?? 'unknown'}`,
          err instanceof Error ? (err.stack ?? err.message) : err,
        );
      }
    }
  }
}
