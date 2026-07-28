// backend/src/modules/whatsapp/wa-types.ts

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
}

export interface WaChat {
  chatId: string;
  chatName: string;
  isGroup: boolean;
  lastBody: string;
  lastTs: number;
  lastFromMe: boolean;
}

export interface WaStatus {
  connection: 'disconnected' | 'connecting' | 'connected';
  hasCredentials: boolean;
  me: { id: string; name: string } | null;
  qr: string | null;
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
