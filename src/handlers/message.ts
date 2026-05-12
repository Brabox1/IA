import type { WASocket, proto } from '@whiskeysockets/baileys';
import { config } from '../config';
import { logger } from '../utils/logger';
import { db } from '../database/db';
import { registry } from '../commands/registry';
import { buildContextAndChat } from '../ai/conversation';
import { sendHumanized, markRead, sendQuick } from '../services/messenger';
import {
  detectMediaType,
  downloadMedia,
  describeImage,
  transcribeAudio,
  extractTextFromPdf,
} from '../services/media';
import { events } from '../events/bus';
import { onlyDigits, extractLinks } from '../utils/helpers';
import type { MessageContext } from '../types';
import { pluginManager } from '../plugins/manager';

export function extractText(msg: proto.IWebMessageInfo): string {
  const m = msg.message;
  if (!m) return '';
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    ''
  );
}

function isOwner(senderJid: string): boolean {
  if (!config.agent.owner) return false;
  const owner = onlyDigits(config.agent.owner);
  const sender = onlyDigits(senderJid);
  return owner === sender;
}

/**
 * Natural-language memory reset detection.
 * The user can just say "esquece tudo" instead of typing /reset.
 */
function isResetRequest(text: string): boolean {
  const t = text.toLowerCase().trim();
  const patterns = [
    /^esquece tudo$/,
    /^esqueça tudo$/,
    /^apaga (a )?mem[oó]ria$/,
    /^limpa (a )?mem[oó]ria$/,
    /^reset(ar)?( tudo)?$/,
    /^começar de novo$/,
    /^começar do zero$/,
    /^forget everything$/,
    /^clear memory$/,
  ];
  return patterns.some(p => p.test(t));
}

export async function handleIncomingMessage(sock: WASocket, msg: proto.IWebMessageInfo) {
  if (msg.key.fromMe) return;
  if (!msg.key.remoteJid || msg.key.remoteJid === 'status@broadcast') return;
  if (!msg.message) return;

  const jid = msg.key.remoteJid;
  const isGroup = jid.endsWith('@g.us');
  const sender = (isGroup ? msg.key.participant : jid) || jid;
  const pushName = msg.pushName || 'amigo';
  const text = extractText(msg).trim();
  const mediaType = detectMediaType(msg.message);
  const isMedia = !!mediaType;
  const mentions = msg.message.extendedTextMessage?.contextInfo?.mentionedJid || [];

  db.upsertUser(sender, pushName);
  const user = db.getUser(sender);
  if (user?.isBlocked) return;

  if (config.antispam.enabled) {
    const rl = db.checkRateLimit(sender, config.antispam.maxPerMin, config.antispam.cooldownMs);
    if (!rl.allowed) {
      logger.warn(`Rate limited: ${sender} (${rl.reason})`);
      return;
    }
  }

  const ctx: MessageContext = {
    sock,
    jid,
    sender,
    isGroup,
    isOwner: isOwner(sender),
    isMedia,
    mediaType,
    text,
    pushName,
    rawMessage: msg,
    quoted: msg.message.extendedTextMessage?.contextInfo?.quotedMessage || null,
    mentions,
    args: [],
  };

  events.emit('message:received', ctx);
  logger.msg(`← ${pushName} (${sender.split('@')[0]}): ${text || '[' + mediaType + ']'}`);

  // Group: only reply when mentioned, named, or replied-to (avoids spamming groups)
  if (isGroup && config.group.respondOnlyWhenMentioned) {
    const botJid = sock.user?.id;
    const normalizedBotJid = botJid?.replace(/:[^@]+@/, '@');
    const isMentioned = !!normalizedBotJid && mentions.includes(normalizedBotJid);
    const startsWithAgentName = new RegExp(`^${config.agent.name}\\b`, 'i').test(text);
    const isReplyToBot =
      msg.message.extendedTextMessage?.contextInfo?.participant === normalizedBotJid;
    if (!isMentioned && !startsWithAgentName && !isReplyToBot) return;
  }

  if (isGroup && config.group.moderation) {
    if (config.group.blockLinks && extractLinks(text).length > 0 && !ctx.isOwner) {
      logger.warn(`Link blocked in group from ${sender}`);
      return;
    }
    const lower = text.toLowerCase();
    if (config.group.blockedWords.some(w => w && lower.includes(w.toLowerCase()))) {
      return;
    }
  }

  await markRead(sock, msg.key);

  // Plugins can intercept
  const handled = await pluginManager.runOnMessage(ctx);
  if (handled) return;

  // Optional slash commands (off by default for normal users)
  if (config.commands.enabled && (text.startsWith('/') || text.startsWith('!'))) {
    if (!config.commands.ownerOnly || ctx.isOwner) {
      const parts = text.slice(1).trim().split(/\s+/);
      const cmd = parts[0];
      const args = parts.slice(1);
      ctx.command = cmd;
      ctx.args = args;
      const executed = await registry.execute(cmd, ctx, args);
      if (executed) {
        events.emit('command:executed', { command: cmd, ctx });
        return;
      }
    }
  }

  // Natural-language memory reset
  if (isResetRequest(text)) {
    db.clearMemory(sender);
    await sendHumanized(sock, jid, 'Pronto, esqueci tudo. Podemos começar do zero. 🙂');
    return;
  }

  // Silent media processing — feed transcript/description into the LLM context
  let mediaContext = '';
  if (isMedia) {
    try {
      const buffer = await downloadMedia(msg);
      if (buffer) {
        if (mediaType === 'audio') {
          const transcript = await transcribeAudio(
            buffer,
            msg.message.audioMessage?.mimetype || 'audio/ogg'
          );
          logger.info(`Audio transcribed (${transcript.length} chars)`);
          mediaContext = `[O usuário enviou um áudio. Transcrição]: ${transcript}`;
        } else if (mediaType === 'image') {
          const desc = await describeImage(
            buffer,
            'Descreva o conteúdo desta imagem em detalhe, incluindo texto se houver.'
          );
          mediaContext = `[O usuário enviou uma imagem. Conteúdo]: ${desc}`;
        } else if (mediaType === 'document') {
          const mime = msg.message.documentMessage?.mimetype || '';
          if (mime.includes('pdf')) {
            const pdfText = await extractTextFromPdf(buffer);
            mediaContext = `[O usuário enviou um PDF. Conteúdo até 3000 caracteres]: ${pdfText.slice(0, 3000)}`;
          }
        }
      }
    } catch (e: any) {
      logger.error(`Media handling failed: ${e.message}`);
    }
  }

  const userInput = mediaContext
    ? `${mediaContext}\n\nMensagem que acompanhou: ${text || '(sem texto)'}`
    : text;

  if (!userInput.trim()) return;

  try {
    const reply = await buildContextAndChat(sender, userInput, pushName);
    await sendHumanized(sock, jid, reply);
    events.emit('message:sent', { jid, text: reply });
  } catch (e: any) {
    logger.error(`Reply generation failed: ${e.message}`);
    await sendQuick(sock, jid, 'Desculpa, tive um problema agora. Pode repetir?');
  }
}
