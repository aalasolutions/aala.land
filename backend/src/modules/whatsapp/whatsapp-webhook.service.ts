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
  LessThan,
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
  WhatsappHistorySyncStatus,
} from './entities/whatsapp-connection.entity';
import { WhatsappMessageStatus } from './entities/whatsapp-message.entity';
import { WhatsappAiService } from './whatsapp-ai.service';
import { MessageStoreService } from './message-store.service';
import { WhatsappGateway } from './whatsapp.gateway';
import {
  WaMessage,
  WaUnreadState,
  WaWebhookJobData,
  WA_WEBHOOK_EVENTS_QUEUE,
} from './wa-types';
import { WebhookVerifyDto } from './dto/webhook-payload.dto';
import { RedisService } from '@modules/redis/redis.service';
import { errorMessage } from '@shared/utils/error.util';
import { envString } from '@shared/utils/env.util';

// Webhook tracing is noisy and can echo customer identifiers, so it stays off in production.
const VERBOSE_WEBHOOK_LOGS = envString('NODE_ENV') !== 'production';

interface CloudWebhookEnvelope {
  entry?: WebhookEntry[];
}

interface WebhookEntry {
  // Usually the WABA id; PARTNER_* account_update events send the partner business id instead, with the WABA in waba_info.
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
  // history only.
  history?: HistoryChunk[];
  // smb_message_echoes only.
  message_echoes?: CloudMessage[];
  errors?: CloudError[];
  // account_update only.
  event?: string;
  phone_number?: string;
  disconnection_info?: { reason?: string; initiated_by?: string };
  // PARTNER_* events only; their entry.id is the partner business, not the WABA.
  waba_info?: { waba_id?: string; owner_business_id?: string };
}

interface CloudError {
  code?: number | string;
}

interface CloudMessage {
  id?: string;
  from?: string;
  // Present only on a message the business sent (echoes and history).
  to?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  edit?: { original_message_id?: string; message?: CloudMessage };
  revoke?: { original_message_id?: string };
}

interface HistoryChunk {
  metadata?: { phase?: number; chunk_order?: number; progress?: number };
  threads?: { id?: string; messages?: CloudMessage[] }[];
  errors?: CloudError[];
}

interface CloudStatus {
  id?: string;
  status?: string;
  timestamp?: string;
  errors?: CloudError[];
}

// WhatsappMessageStatus carries exactly the five strings Meta's status webhook sends.
const META_STATUSES = new Set<string>(Object.values(WhatsappMessageStatus));

// Meta's error when the business turned history sharing off in the WhatsApp Business app.
const HISTORY_DECLINED_CODE = '2593109';

// Media is not stored yet, so non-text messages keep their place in the thread as a label.
const PLACEHOLDER_BODIES: Record<string, string> = {
  image: '[Image]',
  video: '[Video]',
  audio: '[Voice message]',
  document: '[Document]',
  sticker: '[Sticker]',
  location: '[Location]',
  contacts: '[Contact card]',
  media_placeholder: '[Media]',
};

// Long enough for a racing original to land; edits and deletes of messages we never stored just expire.
const PENDING_CHANGE_TTL_MS = 15 * 60 * 1000;

// An edit or delete for a stored message; fromMe says whose message it may touch.
interface MessageChange {
  kind: 'edit' | 'revoke';
  body?: string;
  at: number;
  fromMe: boolean;
}

// History that arrives this long after our request belongs to an earlier owner of the number.
const HISTORY_ACCEPT_WINDOW_MS = 48 * 60 * 60 * 1000;

// Null means no row: reactions, empty text and unknown types.
function resolveStorableBody(message: CloudMessage | undefined): string | null {
  if (!message?.type) return null;
  if (message.type === 'text') {
    const body = message.text?.body ?? '';
    return body.trim() ? body : null;
  }
  return PLACEHOLDER_BODIES[message.type] ?? null;
}

function parseEpochSeconds(value: string | number | undefined): number | null {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

// Falls back to now when Meta sent no usable time.
function parseEpochDate(value: string | number | undefined): Date {
  const seconds = parseEpochSeconds(value);
  return seconds ? new Date(seconds * 1000) : new Date();
}

function digitsOnly(value: string | undefined): string {
  return (value ?? '').replace(/\D/g, '');
}

// The thread id is the customer, so anything not from the customer was sent by the business.
function isHistoryMessageFromBusiness(
  message: CloudMessage,
  customerId: string,
): boolean {
  if (message.to) return true;
  const sender = digitsOnly(message.from);
  return sender !== '' && sender !== digitsOnly(customerId);
}

function historyStatusFor(progress: number): WhatsappHistorySyncStatus {
  return progress >= 100
    ? WhatsappHistorySyncStatus.COMPLETE
    : WhatsappHistorySyncStatus.IN_PROGRESS;
}

// Cloud API one-to-one message; only the identity, direction and body differ per caller.
function buildCloudWaMessage(fields: {
  id: string;
  chatId: string;
  senderId: string;
  senderName?: string;
  body: string;
  mediaType: string;
  fromMe: boolean;
  timestamp: number;
  originUserId: string;
}): WaMessage {
  return {
    ...fields,
    senderName: fields.senderName ?? '',
    chatName: fields.senderName ?? '',
    isGroup: false,
    hasMedia: false,
    mediaUrls: [],
    mentionedIds: [],
    quotedParticipant: '',
    aiGenerated: false,
  };
}

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
    private readonly redis: RedisService,
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
              `Webhook change received: field=${change.field ?? 'none'} entry=${entry.id ?? 'none'}`,
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
    entryId?: string,
    entryTime?: number,
    isRetryAttempt = false,
  ): Promise<void> {
    // account_update has no phone_number_id, so it must branch off before the guard below.
    if (field === 'account_update') {
      await this.handleAccountUpdate(value, entryId, parseEpochDate(entryTime));
      return;
    }

    if (field === 'history' || field === 'smb_message_echoes') {
      const connection = await this.resolveConnection(
        value.metadata?.phone_number_id,
        entryId,
      );
      if (!connection) return;
      if (field === 'history') await this.persistHistory(connection, value);
      else await this.persistEchoes(connection, value, isRetryAttempt);
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

    const connection = await this.resolveConnection(phoneNumberId, entryId);
    if (!connection) return;

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

  private async resolveConnection(
    phoneNumberId: string | undefined,
    wabaId: string | undefined,
  ): Promise<WhatsappConnection | null> {
    if (!phoneNumberId) return null;
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
      return null;
    }

    // A WABA mismatch would route messages to the wrong tenant, so it is rejected outright.
    if (wabaId && connection.wabaId !== wabaId) {
      this.logger.error(
        `Refusing webhook: phone_number_id ${phoneNumberId} is stored under WABA ${connection.wabaId} but was delivered by ${wabaId}`,
      );
      return null;
    }
    return connection;
  }

  // Stored passively: never unread and never reaches the AI; a customer message under 24h old still opens the reply window.
  private async persistHistory(
    connection: WhatsappConnection,
    value: WebhookValue,
  ): Promise<void> {
    const requestedAt = connection.historySyncRequestedAt?.getTime();
    if (!requestedAt || Date.now() - requestedAt > HISTORY_ACCEPT_WINDOW_MS) {
      this.logger.warn(
        `Ignoring history for connection ${connection.id}: no recent history request`,
      );
      return;
    }

    const chunks = value.history ?? [];
    const errors = [
      ...(value.errors ?? []),
      ...chunks.flatMap((chunk) => chunk.errors ?? []),
    ];
    if (errors.some((error) => String(error.code) === HISTORY_DECLINED_CODE)) {
      await this.recordHistorySync(
        connection,
        WhatsappHistorySyncStatus.DECLINED,
        null,
      );
      return;
    }

    let firstError: Error | null = null;
    let progress: number | null = null;
    for (const chunk of chunks) {
      for (const thread of chunk.threads ?? []) {
        const threadError = await this.persistHistoryThread(connection, thread);
        firstError = firstError ?? threadError;
      }
      const chunkProgress = Number(chunk.metadata?.progress);
      if (Number.isFinite(chunkProgress)) {
        progress = Math.max(progress ?? 0, Math.min(chunkProgress, 100));
      }
    }

    // A chunk with a failed row is retried whole, so its progress waits for that retry.
    if (firstError) throw firstError;
    if (progress !== null) {
      await this.recordHistorySync(
        connection,
        historyStatusFor(progress),
        progress,
      );
    }
  }

  private async persistHistoryThread(
    connection: WhatsappConnection,
    thread: { id?: string; messages?: CloudMessage[] },
  ): Promise<Error | null> {
    const chatId = thread.id;
    if (!chatId) return null;
    let firstError: Error | null = null;
    for (const message of thread.messages ?? []) {
      const body = resolveStorableBody(message);
      const timestamp = parseEpochSeconds(message.timestamp);
      if (!message.id || !body || !timestamp) continue;
      const evt = buildCloudWaMessage({
        id: message.id,
        chatId,
        senderId: message.from ?? '',
        body,
        mediaType: message.type ?? 'text',
        fromMe: isHistoryMessageFromBusiness(message, chatId),
        timestamp,
        originUserId: connection.userId,
      });
      try {
        const { inserted } = await this.store.addMessage(
          connection.companyId,
          connection.userId,
          evt,
          connection.phoneNumberId,
          { isPassive: true },
        );
        if (inserted) await this.applyPendingChange(connection, evt.id);
      } catch (err) {
        firstError = firstError ?? toError(err);
        this.logger.error(
          `Failed to persist history message ${message.id}`,
          errorMessage(err, true),
        );
      }
    }
    return firstError;
  }

  // Progress only moves forward and a decline never overwrites complete, since Meta does not guarantee order.
  private async recordHistorySync(
    connection: WhatsappConnection,
    status: WhatsappHistorySyncStatus,
    progress: number | null,
  ): Promise<void> {
    const where =
      progress === null
        ? {
            id: connection.id,
            historySyncStatus: Or(
              IsNull(),
              Not(WhatsappHistorySyncStatus.COMPLETE),
            ),
          }
        : {
            id: connection.id,
            historySyncProgress: Or(IsNull(), LessThan(progress)),
          };
    const result = await this.connections.update(where, {
      historySyncStatus: status,
      historySyncProgress: progress,
    });
    if ((result.affected ?? 0) === 0) return;
    try {
      this.gateway.emitHistory(connection.userId, { status, progress });
    } catch (err) {
      this.logger.error(
        `Failed to push history sync state for user ${connection.userId}`,
        errorMessage(err, true),
      );
    }
  }

  // Replies, edits and deletes made in the WhatsApp Business app; a new reply pauses the AI.
  private async persistEchoes(
    connection: WhatsappConnection,
    value: WebhookValue,
    isRetryAttempt = false,
  ): Promise<void> {
    let firstError: Error | null = null;
    for (const echo of value.message_echoes ?? []) {
      try {
        if (echo.type === 'revoke') {
          await this.applyEchoRevoke(connection, echo);
        } else if (echo.type === 'edit') {
          await this.applyEchoEdit(connection, echo);
        } else {
          await this.persistEchoReply(connection, echo, isRetryAttempt);
        }
      } catch (err) {
        firstError = firstError ?? toError(err);
        this.logger.error(
          `Failed to process WhatsApp echo ${echo.id ?? 'unknown'}`,
          errorMessage(err, true),
        );
      }
    }
    if (firstError) throw firstError;
  }

  private async applyEchoRevoke(
    connection: WhatsappConnection,
    echo: CloudMessage,
  ): Promise<void> {
    const originalId = echo.revoke?.original_message_id;
    if (!originalId) return;
    await this.changeOrPark(connection, originalId, {
      kind: 'revoke',
      at: parseEpochDate(echo.timestamp).getTime(),
      fromMe: true,
    });
  }

  private async applyEchoEdit(
    connection: WhatsappConnection,
    echo: CloudMessage,
  ): Promise<void> {
    const originalId = echo.edit?.original_message_id;
    const body = resolveStorableBody(echo.edit?.message);
    if (!originalId || !body) return;
    await this.changeOrPark(connection, originalId, {
      kind: 'edit',
      body,
      at: parseEpochDate(echo.timestamp).getTime(),
      fromMe: true,
    });
  }

  // A customer delete (Coexistence) or edit; it can only touch the customer's own messages.
  private async applyInboundChange(
    connection: WhatsappConnection,
    message: CloudMessage,
  ): Promise<void> {
    const at = parseEpochDate(message.timestamp).getTime();
    if (message.type === 'revoke') {
      const originalId = message.revoke?.original_message_id;
      if (!originalId) return;
      await this.changeOrPark(connection, originalId, {
        kind: 'revoke',
        at,
        fromMe: false,
      });
      return;
    }
    const originalId = message.edit?.original_message_id;
    const body = resolveStorableBody(message.edit?.message);
    if (!originalId || !body) return;
    await this.changeOrPark(connection, originalId, {
      kind: 'edit',
      body,
      at,
      fromMe: false,
    });
  }

  private async changeOrPark(
    connection: WhatsappConnection,
    originalId: string,
    change: MessageChange,
  ): Promise<void> {
    const isApplied = await this.applyMessageChange(
      connection,
      originalId,
      change,
    );
    if (!isApplied) {
      await this.parkIfOriginalMissing(connection, originalId, change);
    }
  }

  private async applyMessageChange(
    connection: WhatsappConnection,
    waMessageId: string,
    change: MessageChange,
  ): Promise<boolean> {
    const { companyId, userId } = connection;
    const at = new Date(change.at);
    let isApplied = false;
    if (change.kind === 'revoke') {
      isApplied = await this.store.markDeleted(
        companyId,
        userId,
        waMessageId,
        at,
        change.fromMe,
      );
    } else if (change.body) {
      isApplied = await this.store.applyEdit(
        companyId,
        userId,
        waMessageId,
        change.body,
        at,
        change.fromMe,
      );
    }
    if (isApplied) await this.pushUpdatedMessage(connection, waMessageId);
    return isApplied;
  }

  // The open chat merges body, editedAt and deletedAt into the row it already shows.
  private async pushUpdatedMessage(
    connection: WhatsappConnection,
    waMessageId: string,
  ): Promise<void> {
    try {
      const updated = await this.store.getMessage(
        connection.companyId,
        connection.userId,
        waMessageId,
      );
      if (updated) this.gateway.emitMessage(connection.userId, updated);
    } catch (err) {
      this.logger.error(
        `Failed to push the updated WhatsApp message ${waMessageId}`,
        errorMessage(err, true),
      );
    }
  }

  private pendingChangeKey(
    connection: WhatsappConnection,
    originalId: string,
  ): string {
    return `wa:msg:pending:${connection.companyId}:${connection.userId}:${originalId}`;
  }

  // Envelopes run concurrently, so a change can beat its original; it waits here instead of failing the job.
  private async parkIfOriginalMissing(
    connection: WhatsappConnection,
    originalId: string,
    change: MessageChange,
  ): Promise<void> {
    const isStored = await this.store.hasMessage(
      connection.companyId,
      connection.userId,
      originalId,
    );
    if (isStored) return;
    const key = this.pendingChangeKey(connection, originalId);
    const current = await this.redis.getJson<MessageChange>(key);
    // A delete outranks any edit; between edits the newer one wins.
    if (current?.kind === 'revoke') return;
    if (current && change.kind === 'edit' && current.at >= change.at) return;
    await this.redis.setJson(key, change, PENDING_CHANGE_TTL_MS);
    // Closes the gap where the original landed between the check above and the park.
    const isStoredNow = await this.store.hasMessage(
      connection.companyId,
      connection.userId,
      originalId,
    );
    if (isStoredNow) await this.applyPendingChange(connection, originalId);
  }

  private async applyPendingChange(
    connection: WhatsappConnection,
    waMessageId: string,
  ): Promise<void> {
    const key = this.pendingChangeKey(connection, waMessageId);
    const pending = await this.redis.getJson<MessageChange>(key);
    if (!pending) return;
    await this.applyMessageChange(connection, waMessageId, pending);
    await this.redis.del(key);
  }

  private async persistEchoReply(
    connection: WhatsappConnection,
    echo: CloudMessage,
    isRetryAttempt: boolean,
  ): Promise<void> {
    const { companyId, userId } = connection;
    const body = resolveStorableBody(echo);
    const timestamp = parseEpochSeconds(echo.timestamp);
    if (!echo.id || !echo.to || !body || !timestamp) return;
    const evt = buildCloudWaMessage({
      id: echo.id,
      chatId: echo.to,
      senderId: echo.from ?? '',
      body,
      mediaType: echo.type ?? 'text',
      fromMe: true,
      timestamp,
      originUserId: userId,
    });
    const { inserted } = await this.store.addMessage(
      companyId,
      userId,
      evt,
      connection.phoneNumberId,
    );
    // Only our own retry may redo the AI pause for a stored echo; a Meta redelivery must not.
    if (!inserted && !isRetryAttempt) return;
    if (inserted) {
      try {
        this.gateway.emitMessage(userId, evt);
      } catch (err) {
        this.logger.error(
          `Failed to push echoed WhatsApp message ${evt.id}`,
          errorMessage(err, true),
        );
      }
    }
    // After the push, so the parked change reaches the UI as an update; our retry redoes it.
    await this.applyPendingChange(connection, evt.id);
    await this.ai.recordHumanReply(userId, evt.chatId, timestamp * 1000);
  }

  // Mapping is explicit; an unrecognised event changes nothing so guessing never loses a number.
  private async handleAccountUpdate(
    value: WebhookValue,
    entryId: string | undefined,
    eventAt: Date,
  ): Promise<void> {
    const event = value.event;
    const wabaId = value.waba_info?.waba_id ?? entryId;
    this.logger.log(
      `account_update ${event ?? 'none'}: entry=${entryId ?? 'none'} waba=${wabaId ?? 'none'} phone=${value.phone_number ?? 'none'}`,
    );
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
          this.pushConnectionChange(
            connection,
            WhatsappConnectionStatus.CONNECTED,
          );
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
        this.pushConnectionChange(
          connection,
          WhatsappConnectionStatus.DISCONNECTED,
        );
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
          this.pushConnectionChange(
            connection,
            WhatsappConnectionStatus.FLAGGED,
          );
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
          this.pushConnectionChange(
            connection,
            WhatsappConnectionStatus.CONNECTED,
          );
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

  // A live push failure is log-only; the status is already stored.
  private pushConnectionChange(
    connection: WhatsappConnection,
    status: WhatsappConnectionStatus,
  ): void {
    try {
      this.gateway.emitConnection(connection.userId, { status });
    } catch (err) {
      this.logger.error(
        `Failed to push connection status ${status} for user ${connection.userId}`,
        errorMessage(err, true),
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
        const statusAt = parseEpochDate(status.timestamp);
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
        if (message.type === 'revoke' || message.type === 'edit') {
          try {
            await this.applyInboundChange(connection, message);
          } catch (err) {
            firstError = firstError ?? toError(err);
            this.logger.error(
              `Failed to apply the customer change ${message.id ?? 'unknown'}`,
              errorMessage(err, true),
            );
          }
          continue;
        }
        if (message.type !== 'text' || !message.id || !message.from) continue;
        const body = message.text?.body ?? '';
        if (!body.trim()) continue;

        // Cloud API sends seconds; handleIncomingMessage compares against seconds.
        const timestamp = parseEpochSeconds(message.timestamp);
        if (!timestamp) {
          this.logger.warn(
            `Skipping message ${message.id} with a missing or non-numeric timestamp`,
          );
          continue;
        }

        const evt = buildCloudWaMessage({
          id: message.id,
          chatId: message.from,
          senderId: message.from,
          senderName: names.get(message.from) ?? '',
          body,
          mediaType: 'text',
          fromMe: false,
          timestamp,
          originUserId: connection.userId,
        });

        // Persist first; a store failure propagates for BullMQ retry.
        let firstDelivery: boolean;
        let unread: WaUnreadState;
        try {
          ({ inserted: firstDelivery, unread } = await this.store.addMessage(
            connection.companyId,
            connection.userId,
            evt,
            phoneNumberId,
          ));
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

        if (firstDelivery) {
          // A live push failure is log-only; the AI turn must still run.
          try {
            this.gateway.emitMessage(connection.userId, evt);
          } catch (err) {
            this.logger.error(
              `Failed to push WhatsApp message ${evt.id}`,
              errorMessage(err, true),
            );
          }
          try {
            this.gateway.emitUnread(connection.userId, unread);
          } catch (err) {
            this.logger.error(
              `Failed to push unread state for ${evt.id}`,
              errorMessage(err, true),
            );
          }
        }
        // Runs on our retry too, so a failed apply is not lost once the row exists.
        let current: WaMessage | null;
        try {
          await this.applyPendingChange(connection, evt.id);
          current = await this.store.getMessage(
            connection.companyId,
            connection.userId,
            evt.id,
          );
        } catch (err) {
          firstError = firstError ?? toError(err);
          this.logger.error(
            `Failed to apply a parked change to ${evt.id}`,
            errorMessage(err, true),
          );
          continue;
        }
        // Read back so a customer delete or edit that already landed is what the AI sees.
        if (current?.deletedAt) continue;
        const aiEvt = current ? { ...evt, body: current.body } : evt;
        // A flagged token cannot send, so an AI turn would only burn a credit on a failure.
        if (connection.status !== WhatsappConnectionStatus.CONNECTED) {
          this.logger.debug(
            `Skipping the AI turn for ${evt.id}: connection is ${connection.status}`,
          );
          continue;
        }
        try {
          await this.ai.handleIncomingMessage(
            aiEvt,
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
        // Unexpected per-message failure is log-only.
        this.logger.error(
          `Failed to process WhatsApp message ${message.id ?? 'unknown'}`,
          errorMessage(err, true),
        );
      }
    }
    if (firstError) throw firstError;
  }
}
