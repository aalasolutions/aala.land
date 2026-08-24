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
  changes?: WebhookChange[];
}

interface WebhookChange {
  value?: WebhookValue;
}

interface WebhookValue {
  metadata?: { phone_number_id?: string };
  contacts?: { profile?: { name?: string }; wa_id?: string }[];
  messages?: CloudMessage[];
  statuses?: CloudStatus[];
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
          await this.dispatchValue(change.value ?? {});
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

  private async dispatchValue(value: WebhookValue): Promise<void> {
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

    if (statuses.length > 0) {
      await this.persistStatuses(connection, statuses);
    }
    if (messages.length > 0) {
      await this.dispatchMessages(connection, value, messages, phoneNumberId);
    }
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
