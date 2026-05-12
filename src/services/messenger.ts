import type { WASocket } from '@whiskeysockets/baileys';
import { sleep, humanTypingDelay, chunkText } from '../utils/helpers';
import { config } from '../config';
import { logger } from '../utils/logger';

/**
 * Sends a message in the most natural, ChatGPT-like way:
 * - Shows "typing..." presence
 * - Waits a realistic time based on length
 * - Splits long replies into shorter chunks
 */
export async function sendHumanized(sock: WASocket, jid: string, text: string) {
  const chunks = chunkText(text, 700);
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    if (config.behavior.humanTyping) {
      try { await sock.sendPresenceUpdate('composing', jid); } catch {}
      const delay = humanTypingDelay(chunk);
      await sleep(delay);
      try { await sock.sendPresenceUpdate('paused', jid); } catch {}
    }

    try {
      await sock.sendMessage(jid, { text: chunk });
      logger.msg(`→ ${jid.split('@')[0]}: ${chunk.substring(0, 80)}${chunk.length > 80 ? '...' : ''}`);
    } catch (e: any) {
      logger.error(`Send failed: ${e.message}`);
    }

    if (i < chunks.length - 1) await sleep(600);
  }
}

export async function sendQuick(sock: WASocket, jid: string, text: string) {
  try { await sock.sendMessage(jid, { text }); }
  catch (e: any) { logger.error(`Send failed: ${e.message}`); }
}

/**
 * Emoji reactions are only sent when explicitly enabled in config.
 * In pure LLM mode this is a no-op.
 */
export async function sendReaction(sock: WASocket, jid: string, key: any, emoji: string) {
  if (!config.behavior.reactions) return;
  try { await sock.sendMessage(jid, { react: { text: emoji, key } }); } catch {}
}

export async function markRead(sock: WASocket, key: any) {
  if (!config.behavior.readReceipts) return;
  try { await sock.readMessages([key]); } catch {}
}

export async function sendImage(sock: WASocket, jid: string, buffer: Buffer, caption?: string) {
  try { await sock.sendMessage(jid, { image: buffer, caption }); }
  catch (e: any) { logger.error(`Image send failed: ${e.message}`); }
}

export async function sendAudio(sock: WASocket, jid: string, buffer: Buffer, asVoiceNote = true) {
  try {
    await sock.sendMessage(jid, { audio: buffer, mimetype: 'audio/mp4', ptt: asVoiceNote });
  } catch (e: any) { logger.error(`Audio send failed: ${e.message}`); }
}
