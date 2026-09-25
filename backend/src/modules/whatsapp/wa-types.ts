import {
  WhatsappConnectionStatus,
  WhatsappHistorySyncStatus,
} from './entities/whatsapp-connection.entity';
import { WhatsappMessageStatus } from './entities/whatsapp-message.entity';

export enum WaMediaStatus {
  PENDING = 'PENDING',
  STORED = 'STORED',
  FAILED = 'FAILED',
  TOO_LARGE = 'TOO_LARGE',
  DELETED = 'DELETED',
}

// media_deleted_by holds a user id, or one of these when WhatsApp itself revoked the message.
export const WA_MEDIA_DELETED_BY = {
  CUSTOMER_REVOKE: 'CUSTOMER_REVOKE',
  BUSINESS_APP_REVOKE: 'BUSINESS_APP_REVOKE',
} as const;

export interface WaMessage {
  // Row primary key; id below is the WhatsApp message id.
  uuid: string;
  id: string;
  chatId: string;
  senderId: string;
  senderName: string;
  chatName: string;
  isGroup: boolean;
  body: string;
  hasMedia: boolean;
  mediaType: string;
  mediaMime: string | null;
  mediaFileName: string | null;
  mediaSizeBytes: number | null;
  mediaStatus: WaMediaStatus | null;
  // ISO strings, unlike the epoch-second fields below.
  mediaStoredAt: string | null;
  mediaDeletedAt: string | null;
  mediaDeletedBy: string | null;
  mentionedIds: string[];
  quotedParticipant: string;
  fromMe: boolean;
  aiGenerated: boolean;
  timestamp: number;
  originUserId?: string;
  // Outbound only. Inbound rows carry no delivery status.
  status?: WhatsappMessageStatus | null;
  // Epoch SECONDS, like timestamp above, not an ISO string.
  statusAt?: number | null;
  errorCode?: string | null;
  editedAt?: number | null;
  // Set means Meta revoked the message; the row and its stub are still returned.
  deletedAt?: number | null;
}

type WaMessageOutputOnly =
  | 'uuid'
  | 'mediaMime'
  | 'mediaFileName'
  | 'mediaSizeBytes'
  | 'mediaStatus'
  | 'mediaStoredAt'
  | 'mediaDeletedAt'
  | 'mediaDeletedBy';

// No stored media yet: the output media fields of a message built before its row exists.
export const WA_MESSAGE_NO_STORED_MEDIA = {
  mediaMime: null,
  mediaFileName: null,
  mediaSizeBytes: null,
  mediaStatus: null,
  mediaStoredAt: null,
  mediaDeletedAt: null,
  mediaDeletedBy: null,
} as const satisfies Partial<WaMessage>;

// Shape callers pass to MessageStoreService inserts. uuid, when given, becomes the row id, so a
// payload emitted before the insert carries the same id; omitted, Postgres generates it.
export type WaMessageInsert = Omit<WaMessage, WaMessageOutputOnly> & {
  uuid?: string;
  mediaMetaId?: string | null;
  mediaMime?: string | null;
  mediaFileName?: string | null;
  mediaSizeBytes?: number | null;
  mediaSha256?: string | null;
  mediaStatus?: WaMediaStatus | null;
};

export interface WaChat {
  chatId: string;
  chatName: string;
  isGroup: boolean;
  lastBody: string;
  lastTs: number;
  lastFromMe: boolean;
  // Epoch SECONDS of last inbound message, or null; Meta's 24h window is measured from here.
  lastInboundAt: number | null;
  unreadCount: number;
  lastReadMessageId: string | null;
}

// Payload of the whatsapp:read ack and the whatsapp:unread event.
export interface WaUnreadState {
  chatId: string;
  unreadCount: number;
  lastReadMessageId: string | null;
}

export interface WaMessageWindow {
  messages: WaMessage[];
  hasMoreOlder: boolean;
  hasMoreNewer: boolean;
}

// Pinned deliberately and shared here so the send path and Embedded Signup path can't drift apart.
export const GRAPH_VERSION = 'v26.0';

// Public by design: Meta already exposes appId and configId in its client-side SDK call.
export interface WaSignupConfig {
  appId: string | null;
  configId: string | null;
  graphVersion: string;
}

// The caller's own connected number. Never carries the access token.
export interface WaConnectionInfo {
  status: WhatsappConnectionStatus;
  displayPhoneNumber: string;
  connectedAt: string | null;
  disconnectedAt: string | null;
  disconnectReason: string | null;
  historySyncStatus: WhatsappHistorySyncStatus | null;
  historySyncProgress: number | null;
}

export interface WaHistorySyncState {
  status: WhatsappHistorySyncStatus;
  progress: number | null;
}

export interface WaConnectionState {
  status: WhatsappConnectionStatus;
}

export interface AiCreditAgentUsage {
  userId: string;
  name: string;
  credits: number;
  aiTurns: number;
  leads: number;
}

export interface AiCreditUsageSummary {
  used: number;
  limit: number;
  openWindows: number;
  resetsAt: string;
}

export interface AiCreditUsageWithAgents extends AiCreditUsageSummary {
  periodStart: string;
  agents: AiCreditAgentUsage[];
}

export interface AiToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface AiHistoryMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | null;
  tool_call_id?: string;
  tool_calls?: AiToolCall[];
}

export const WA_AI_DEBOUNCE_QUEUE = 'wa-ai-debounce';

export interface DebounceJobData {
  userId: string;
  chatId: string;
  companyId: string;
  deadlineAt: number;
}

export interface DebouncedBuffer {
  combinedText: string;
  messageIds: string[];
}

export const WA_WEBHOOK_EVENTS_QUEUE = 'wa-webhook-events';

export interface WaWebhookJobData {
  // Parsed Meta envelope, signature already verified at the HTTP edge.
  envelope: unknown;
}

export const WA_MEDIA_QUEUE = 'wa-media';
export const WA_MEDIA_INGEST_JOB = 'ingest';

export interface WaMediaJobData {
  // whatsapp_messages row id.
  messageUuid: string;
  companyId: string;
}

// Labels a message by type where its body is empty: stored media, or a placeholder row.
export const WA_PLACEHOLDER_BODIES: Record<string, string> = {
  image: '[Image]',
  video: '[Video]',
  audio: '[Voice message]',
  document: '[Document]',
  sticker: '[Sticker]',
  location: '[Location]',
  contacts: '[Contact card]',
  media_placeholder: '[Media]',
};
