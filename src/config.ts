import 'dotenv/config';
import path from 'path';

export const config = {
  agent: {
    name: process.env.AGENT_NAME || 'Nexus',
    owner: process.env.AGENT_OWNER || '',
    defaultPersonality: process.env.AGENT_DEFAULT_PERSONALITY || 'humanized',
    language: process.env.AGENT_LANGUAGE || 'pt-BR',
  },
  ai: {
    provider: (process.env.AI_PROVIDER || 'openai') as 'openai' | 'claude' | 'gemini',
    openai: {
      apiKey: process.env.OPENAI_API_KEY || '',
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: parseFloat(process.env.OPENAI_TEMPERATURE || '0.7'),
    },
    claude: {
      apiKey: process.env.ANTHROPIC_API_KEY || '',
      model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022',
    },
    gemini: {
      apiKey: process.env.GEMINI_API_KEY || '',
      model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
    },
  },
  db: {
    type: (process.env.DB_TYPE || 'sqlite') as 'sqlite' | 'postgres',
    path: process.env.DB_PATH || path.join(process.cwd(), 'database', 'agent.db'),
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER,
    pass: process.env.DB_PASS,
    name: process.env.DB_NAME,
  },
  redis: {
    enabled: process.env.REDIS_ENABLED === 'true',
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
  },
  behavior: {
    humanTyping: process.env.HUMAN_TYPING_ENABLED !== 'false',
    typingWpm: parseInt(process.env.HUMAN_TYPING_WPM || '350'),
    delayMin: parseInt(process.env.HUMAN_DELAY_MIN || '800'),
    delayMax: parseInt(process.env.HUMAN_DELAY_MAX || '2500'),
    readReceipts: process.env.READ_RECEIPTS !== 'false',
    maxContext: parseInt(process.env.MAX_CONTEXT_MESSAGES || '20'),
    // Whether the bot reacts with emoji while processing messages.
    // For pure LLM mode, set false so the bot just replies like ChatGPT.
    reactions: process.env.REACTIONS_ENABLED === 'true',
  },
  // Slash commands are off by default — the bot behaves like a pure LLM.
  // Set COMMANDS_ENABLED=true to allow them, and COMMANDS_OWNER_ONLY to limit.
  commands: {
    enabled: process.env.COMMANDS_ENABLED === 'true',
    ownerOnly: process.env.COMMANDS_OWNER_ONLY !== 'false',
  },
  antispam: {
    enabled: process.env.ANTISPAM_ENABLED !== 'false',
    maxPerMin: parseInt(process.env.ANTISPAM_MAX_MSGS_PER_MIN || '15'),
    cooldownMs: parseInt(process.env.ANTISPAM_COOLDOWN_MS || '2000'),
  },
  group: {
    respondOnlyWhenMentioned: process.env.GROUP_RESPOND_ONLY_WHEN_MENTIONED !== 'false',
    moderation: process.env.GROUP_MODERATION === 'true',
    blockLinks: process.env.GROUP_BLOCK_LINKS === 'true',
    blockedWords: (process.env.GROUP_BLOCKED_WORDS || '').split(',').map(w => w.trim()).filter(Boolean),
  },
  api: {
    enabled: process.env.API_ENABLED === 'true',
    port: parseInt(process.env.API_PORT || '3000'),
    token: process.env.API_TOKEN || 'change-me',
    webhook: process.env.WEBHOOK_URL || '',
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    debug: process.env.DEBUG_MODE === 'true',
  },
  paths: {
    sessions: path.join(process.cwd(), 'sessions'),
    logs: path.join(process.cwd(), 'logs'),
    media: path.join(process.cwd(), 'media'),
  },
};

export default config;
