// backend/src/modules/whatsapp/wa-types.ts
import { WhatsappConnectionStatus } from './entities/whatsapp-connection.entity';
import { WhatsappMessageStatus } from './entities/whatsapp-message.entity';

export interface WaMessage {
  id: string;
  chatId: string;
  senderId: string;
  senderName: string;
  chatName: string;
  isGroup: boolean;
  body: string;
  hasMedia: boolean;
  mediaType: string;
  mediaUrls: string[];
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

export interface WaChat {
  chatId: string;
  chatName: string;
  isGroup: boolean;
  lastBody: string;
  lastTs: number;
  lastFromMe: boolean;
  // Epoch SECONDS of the last inbound customer message, or null when the
  // customer has never written. Meta's 24h reply window is measured from here.
  lastInboundAt: number | null;
}

// Pinned on purpose: a version bump is a deliberate act, never a drift. Shared here
// because both the send path and the Embedded Signup path address the same Graph API,
// and two copies of a pin is exactly how a pin drifts.
export const GRAPH_VERSION = 'v23.0';

// Values the browser needs to launch Embedded Signup. Public by design; Meta exposes
// both in the client-side SDK call, so serving them is not a disclosure.
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

export interface AiHistoryMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | null;
  tool_call_id?: string;
  tool_calls?: any[];
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
