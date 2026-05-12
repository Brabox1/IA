import type { WASocket, proto } from '@whiskeysockets/baileys';

export interface MessageContext {
  sock: WASocket;
  jid: string;          // chat id (private or group)
  sender: string;       // sender's jid (in groups != chat id)
  isGroup: boolean;
  isOwner: boolean;
  isMedia: boolean;
  mediaType?: 'image' | 'audio' | 'video' | 'document' | 'sticker';
  text: string;
  pushName: string;
  rawMessage: proto.IWebMessageInfo;
  quoted?: proto.IMessage | null;
  mentions: string[];
  command?: string;
  args: string[];
}

export interface User {
  jid: string;
  name: string;
  language: string;
  personality: string;
  isBlocked: boolean;
  totalMessages: number;
  firstSeen: number;
  lastSeen: number;
  notes: string;        // long-term memory blob
}

export interface MemoryMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export interface CommandDefinition {
  name: string;
  aliases?: string[];
  description: string;
  usage?: string;
  category: 'general' | 'ai' | 'media' | 'sales' | 'support' | 'admin' | 'fun';
  ownerOnly?: boolean;
  groupOnly?: boolean;
  privateOnly?: boolean;
  handler: (ctx: MessageContext, args: string[]) => Promise<void>;
}

export interface Personality {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  temperature?: number;
  emojiFrequency: 'none' | 'low' | 'medium' | 'high';
}

export interface Plugin {
  name: string;
  version: string;
  enabled: boolean;
  onLoad?: () => Promise<void> | void;
  onMessage?: (ctx: MessageContext) => Promise<boolean | void>; // return true to stop pipeline
  onUnload?: () => Promise<void> | void;
}

export interface AIRequest {
  systemPrompt: string;
  messages: MemoryMessage[];
  temperature?: number;
  maxTokens?: number;
  model?: string;
}

export interface AIResponse {
  text: string;
  tokens?: number;
  model: string;
  provider: string;
}

export type EventName =
  | 'message:received'
  | 'message:sent'
  | 'connection:open'
  | 'connection:close'
  | 'qr'
  | 'command:executed'
  | 'ai:request'
  | 'ai:response'
  | 'error';
