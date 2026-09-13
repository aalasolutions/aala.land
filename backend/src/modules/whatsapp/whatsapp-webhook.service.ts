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
import {
  IsNull,
  LessThanOrEqual,
  Not,
  Or,
  Repository,
  UpdateResult,
} from 'typeorm';
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
import { errorMessage } from '@shared/utils/error.util';
import { envString } from '@shared/utils/env.util';

// Webhook tracing is noisy and can echo customer identifiers, so it stays off in production.
const VERBOSE_WEBHOOK_LOGS = envString('NODE_ENV') !== 'production';

interface CloudWebhookEnvelope {
  entry?: WebhookEntry[];
}

interface WebhookEntry {
  // The WABA id: the only routing key account_update carries (no metadata.phone_number_id).
  id?: string;
  // Unix seconds.
  time?: number;
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

const LIFECYCLE_EVENTS = new Set<string>([
  'PARTNER_ADDED',
  'PARTNER_REMOVED',
  'ACCOUNT_OFFBOARDED',
  'ACCOUNT_RECONNECTED',
]);

// Preserves the Error/stack; wraps non-Error rejections so `throw` never sees a non-Error.
function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(errorMessage(err));
}

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
    const expected = envString('WHATSAPP_VERIFY_TOKEN');
    if (!expected) {
      this.logger.error('WHATSAPP_VERIFY_TOKEN is not set; refusing handshake');
      throw new ForbiddenException();
    }
    const givenToken = query['hub.verify_token'];
    const given = Buffer.from(typeof givenToken === 'string' ? givenToken : '');
    const wanted = Buffer.from(expected);
    const tokenMatches =
      given.length === wanted.length && timingSafeEqual(given, wanted);
    if (query['hub.mode'] !== 'subscribe' || !tokenMatches) {
      throw new ForbiddenException();
    }
    return query['hub.challenge'];
  }

  // Fails closed if no app secret; past the signature it just parses and enqueues for a fast 200.
  async handleWebhook(
    rawBody: Buffer | undefined,
    signature: string | undefined,
  ): Promise<{ received: true }> {
    if (!rawBody || rawBody.length === 0) throw new BadRequestException();
    const appSecret = envString('WHATSAPP_APP_SECRET');
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

    // The only 5xx here; Meta redelivers, the correct recovery when the queue is unreachable.
    try {
      await this.webhookQueue.add('envelope', { envelope });
    } catch (err) {
      this.logger.error(
        'Failed to enqueue a WhatsApp webhook envelope',
        errorMessage(err, true),
      );
      throw new InternalServerErrorException();
    }
    return { received: true };
  }

  async processEnvelope(body: unknown, isRetryAttempt = false): Promise<void> {
    const envelope = (body ?? {}) as CloudWebhookEnvelope;

    // Siblings still run, then the first error is rethrown so BullMQ retries the envelope.
    let firstError: Error | null = null;
    for (const entry of envelope.entry ?? []) {
      for (const change of entry.changes ?? []) {
        try {
          if (VERBOSE_WEBHOOK_LOGS) {
            this.logger.log(
              `Webhook change received: field=${change.field ?? 'none'} waba=${entry.id ?? 'none'}`,
            );
          }
          await this.dispatchValue(
            change.value ?? {},
            change.field,
            entry.id,
            entry.time,
            isRetryAttempt,
          );
        } catch (err) {
          firstError = firstError ?? toError(err);
          this.logger.error(
            'Failed to process a WhatsApp webhook change',
            errorMessage(err, true),
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
    entryTime?: number,
    isRetryAttempt = false,
  ): Promise<void> {
    // account_update has no phone_number_id, so it must branch off before the guard below.
    if (field === 'account_update') {
      const seconds = Number(entryTime);
      const eventAt =
        Number.isFinite(seconds) && seconds > 0
          ? new Date(seconds * 1000)
          : new Date();
      await this.handleAccountUpdate(value, wabaId, eventAt);
      return;
    }

    const phoneNumberId = value.metadata?.phone_number_id;
    const messages = value.messages ?? [];
    const statuses = value.statuses ?? [];
    if (!phoneNumberId || (messages.length === 0 && statuses.length === 0)) {
      // A dropped event must never look like a processed one in the logs.
      if (VERBOSE_WEBHOOK_LOGS) {
        this.logger.warn(
          `Webhook DROPPED, field "${field ?? 'none'}" is not handled: ` +
            `phone_number_id=${phoneNumberId ?? 'absent'} messages=${messages.length} statuses=${statuses.length}`,
        );
      }
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

    // A WABA mismatch would route messages to the wrong tenant, so it is rejected outright.
    if (wabaId && connection.wabaId !== wabaId) {
      this.logger.error(
        `Refusing webhook: phone_number_id ${phoneNumberId} is stored under WABA ${connection.wabaId} but was delivered by ${wabaId}`,
      );
      return;
    }

    // Both branches run even if one throws, so a status failure can't cost the messages too.
    let firstError: Error | null = null;
    if (statuses.length > 0) {
      try {
        await this.persistStatuses(connection, statuses);
      } catch (err) {
        firstError = toError(err);
      }
    }
    if (messages.length > 0) {
      try {
        await this.dispatchMessages(
          connection,
          value,
          messages,
          phoneNumberId,
          isRetryAttempt,
        );
      } catch (err) {
        firstError = firstError ?? toError(err);
      }
    }
    if (firstError) throw firstError;
  }

  // Mapping is explicit; an unrecognised event changes nothing so guessing never loses a number.
  private async handleAccountUpdate(
    value: WebhookValue,
    wabaId: string | undefined,
    eventAt: Date,
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

    const notStale = Or(IsNull(), LessThanOrEqual(eventAt));
    // Records the time even when the transition below is a no-op, so an older event arriving later is refused.
    if (LIFECYCLE_EVENTS.has(event)) {
      const claimed = await this.connections.update(
        { id: connection.id, lifecycleEventAt: notStale },
        { lifecycleEventAt: eventAt },
      );
      if (!claimed.affected) {
        this.logger.log(
          `account_update ${event} for ${connection.phoneNumberId} ignored; the event is stale`,
        );
        return;
      }
    }
    const ignoredAsStale = (result: UpdateResult): boolean => {
      if (result.affected) return false;
      this.logger.log(
        `account_update ${event} for ${connection.phoneNumberId} ignored; the event is stale`,
      );
      return true;
    };

    switch (event) {
      case 'PARTNER_ADDED': {
        // Normally confirms what the connect endpoint already stored; matters only if this arrives first.
        if (
          connection.status === WhatsappConnectionStatus.PENDING &&
          connection.accessTokenCiphertext
        ) {
          const result = await this.connections.update(
            { id: connection.id, lifecycleEventAt: notStale },
            {
              status: WhatsappConnectionStatus.CONNECTED,
              connectedAt: new Date(),
              disconnectedAt: null,
              disconnectReason: null,
              lifecycleEventAt: eventAt,
            },
          );
          if (ignoredAsStale(result)) return;
        }
        this.logger.log(
          `account_update PARTNER_ADDED for WABA ${wabaId} (${connection.phoneNumberId})`,
        );
        return;
      }
      case 'PARTNER_REMOVED': {
        const reason = value.disconnection_info?.reason ?? 'PARTNER_REMOVED';
        const result = await this.connections.update(
          { id: connection.id, lifecycleEventAt: notStale },
          {
            status: WhatsappConnectionStatus.DISCONNECTED,
            disconnectedAt: new Date(),
            disconnectReason: reason.slice(0, 64),
            lifecycleEventAt: eventAt,
          },
        );
        if (ignoredAsStale(result)) return;
        this.logger.warn(
          `WhatsApp connection ${connection.phoneNumberId} disconnected by Meta: ${reason}`,
        );
        return;
      }
      case 'ACCOUNT_OFFBOARDED': {
        // Once disconnected, stays disconnected: only a CONNECTED row may be suspended.
        const result = await this.connections.update(
          {
            id: connection.id,
            status: WhatsappConnectionStatus.CONNECTED,
            lifecycleEventAt: notStale,
          },
          {
            status: WhatsappConnectionStatus.FLAGGED,
            disconnectReason: 'ACCOUNT_OFFBOARDED',
            lifecycleEventAt: eventAt,
          },
        );
        if (result.affected) {
          this.logger.warn(
            `WhatsApp connection ${connection.phoneNumberId} offboarded; awaiting ACCOUNT_RECONNECTED`,
          );
        } else {
          this.logger.log(
            `ACCOUNT_OFFBOARDED for ${connection.phoneNumberId} ignored; row is not CONNECTED or the event is stale`,
          );
        }
        return;
      }
      case 'ACCOUNT_RECONNECTED': {
        if (!connection.accessTokenCiphertext) {
          this.logger.warn(
            `ACCOUNT_RECONNECTED for ${connection.phoneNumberId} but no token is stored; the agent must reconnect`,
          );
          return;
        }
        // Only undoes ACCOUNT_OFFBOARDED; other flagged or disconnected rows never auto-reconnect.
        const result = await this.connections.update(
          {
            id: connection.id,
            status: WhatsappConnectionStatus.FLAGGED,
            disconnectReason: 'ACCOUNT_OFFBOARDED',
            lifecycleEventAt: notStale,
          },
          {
            status: WhatsappConnectionStatus.CONNECTED,
            connectedAt: new Date(),
            disconnectedAt: null,
            disconnectReason: null,
            lifecycleEventAt: eventAt,
          },
        );
        if (result.affected) {
          this.logger.log(
            `WhatsApp connection ${connection.phoneNumberId} reconnected`,
          );
        } else {
          this.logger.log(
            `ACCOUNT_RECONNECTED for ${connection.phoneNumberId} ignored; row was not offboarded or the event is stale`,
          );
        }
        return;
      }
      default:
        this.logger.warn(
          `Unhandled account_update event "${event}" for WABA ${wabaId}; no status changed`,
        );
    }
  }

  // A WABA can host 20 numbers; matched by digits, doing nothing rather than guessing wrong.
  private async findConnectionForAccountUpdate(
    wabaId: string,
    phoneNumber: string | undefined,
  ): Promise<WhatsappConnection | null> {
    // Once disconnected, only pressing Connect again revives a row, never a Meta lifecycle event.
    const rows = await this.connections.find({
      where: { wabaId, status: Not(WhatsappConnectionStatus.DISCONNECTED) },
    });
    if (rows.length === 0) {
      this.logger.warn(
        `account_update for WABA ${wabaId} has no live connection; ignored`,
      );
      return null;
    }
    const digits = (v: string | undefined) => (v ?? '').replace(/\D/g, '');
    const wanted = digits(phoneNumber);

    if (rows.length === 1) {
      const only = rows[0];
      const stored = digits(only.displayPhoneNumber);
      // Rejects only on a POSITIVE mismatch; an unknown side or a sibling number leaves it alone.
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

  // Retrying is safe: applyMessageStatus is a rank-guarded, idempotent UPDATE.
  private async persistStatuses(
    connection: WhatsappConnection,
    statuses: CloudStatus[],
  ): Promise<void> {
    let firstError: Error | null = null;
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
        const errorCode =
          mapped === WhatsappMessageStatus.FAILED && failureCode != null
            ? String(failureCode)
            : null;
        const applied = await this.store.applyMessageStatus(
          connection.companyId,
          connection.userId,
          status.id,
          mapped,
          statusAt,
          errorCode,
        );
        if (!applied) {
          this.logger.debug(
            `Status ${mapped} not stored for ${status.id}: unknown message or a stale status`,
          );
          continue;
        }
        // A live push failure is log-only; the status is already stored.
        try {
          this.gateway.emitStatus(connection.userId, {
            id: status.id,
            status: mapped,
            statusAt: Math.floor(statusAt.getTime() / 1000),
            errorCode,
          });
        } catch (err) {
          this.logger.error(
            `Failed to push status ${mapped} for ${status.id}`,
            errorMessage(err, true),
          );
        }
      } catch (err) {
        firstError = firstError ?? toError(err);
        this.logger.error(
          `Failed to persist status callback for ${status.id ?? 'unknown'}`,
          errorMessage(err, true),
        );
      }
    }
    if (firstError) throw firstError;
  }

  private async dispatchMessages(
    connection: WhatsappConnection,
    value: WebhookValue,
    messages: CloudMessage[],
    phoneNumberId: string,
    isRetryAttempt = false,
  ): Promise<void> {
    const names = new Map<string, string>();
    for (const contact of value.contacts ?? []) {
      if (contact.wa_id) names.set(contact.wa_id, contact.profile?.name ?? '');
    }

    // Siblings still run; persistence and AI hand-off failures rethrow for retry.
    let firstError: Error | null = null;
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

        // Persist first; a store failure propagates for BullMQ retry.
        let firstDelivery: boolean;
        try {
          firstDelivery = await this.store.addMessage(
            connection.companyId,
            connection.userId,
            evt,
            phoneNumberId,
          );
        } catch (err) {
          firstError = firstError ?? toError(err);
          this.logger.error(
            `Failed to persist WhatsApp message ${evt.id}`,
            errorMessage(err, true),
          );
          continue;
        }
        // Meta redelivers for up to 7 days; only our own retry may re-attempt a stored message's AI hand-off.
        if (!firstDelivery && !isRetryAttempt) {
          this.logger.debug(`Skipping redelivered WhatsApp message ${evt.id}`);
          continue;
        }

        if (firstDelivery) this.gateway.emitMessage(connection.userId, evt);
        // A flagged token cannot send, so an AI turn would only burn a credit on a failure.
        if (connection.status !== WhatsappConnectionStatus.CONNECTED) {
          this.logger.debug(
            `Skipping the AI turn for ${evt.id}: connection is ${connection.status}`,
          );
          continue;
        }
        try {
          await this.ai.handleIncomingMessage(
            evt,
            connection.companyId,
            connection.userId,
          );
        } catch (err) {
          firstError = firstError ?? toError(err);
          this.logger.error(
            `Failed the AI hand-off for WhatsApp message ${evt.id}`,
            errorMessage(err, true),
          );
        }
      } catch (err) {
        // A live push failure is log-only; the message is already stored.
        this.logger.error(
          `Failed to process WhatsApp message ${message.id ?? 'unknown'}`,
          errorMessage(err, true),
        );
      }
    }
    if (firstError) throw firstError;
  }
}
