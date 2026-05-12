import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
  fetchLatestBaileysVersion,
  type WASocket,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { logger } from '../utils/logger';
import { handleIncomingMessage } from '../handlers/message';
import { printConnected } from '../utils/banner';
import { events } from '../events/bus';

let sock: WASocket | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT = 10;

export function getSocket(): WASocket | null {
  return sock;
}

export async function startWhatsApp(): Promise<WASocket> {
  if (!fs.existsSync(config.paths.sessions)) {
    fs.mkdirSync(config.paths.sessions, { recursive: true });
  }

  const sessionPath = path.join(config.paths.sessions, 'main');
  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const { version, isLatest } = await fetchLatestBaileysVersion();

  logger.info(`Baileys version: ${version.join('.')} ${isLatest ? '(latest)' : '(outdated)'}`);

  sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false, // we render it ourselves
    logger: pino({ level: 'silent' }) as any,
    browser: Browsers.macOS(config.agent.name),
    syncFullHistory: false,
    markOnlineOnConnect: true,
    generateHighQualityLinkPreview: true,
  });

  // ─── credentials ───
  sock.ev.on('creds.update', saveCreds);

  // ─── connection lifecycle ───
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      logger.event('QR Code received — scan with WhatsApp to connect');
      console.log();
      qrcode.generate(qr, { small: true });
      console.log();
      events.emit('qr', qr);
    }

    if (connection === 'open') {
      reconnectAttempts = 0;
      const me = sock!.user?.id || 'unknown';
      printConnected(me);
      events.emit('connection:open', { jid: me });
    }

    if (connection === 'close') {
      const code = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut;
      logger.warn(`Connection closed. Code: ${code}. Reconnect: ${shouldReconnect}`);
      events.emit('connection:close', { code });

      if (shouldReconnect && reconnectAttempts < MAX_RECONNECT) {
        const delay = Math.min(2000 * Math.pow(2, reconnectAttempts), 30000);
        reconnectAttempts++;
        logger.info(`Reconnecting in ${delay / 1000}s (attempt ${reconnectAttempts}/${MAX_RECONNECT})…`);
        setTimeout(() => startWhatsApp(), delay);
      } else if (code === DisconnectReason.loggedOut) {
        logger.error('Logged out from WhatsApp. Delete the sessions/ folder and restart.');
        process.exit(1);
      } else {
        logger.error('Max reconnection attempts reached. Exiting.');
        process.exit(1);
      }
    }
  });

  // ─── messages ───
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      // process each independently, isolate errors
      handleIncomingMessage(sock!, msg).catch(e =>
        logger.error(`Unhandled message error: ${e.message}`)
      );
    }
  });

  // ─── groups ───
  sock.ev.on('group-participants.update', async (update) => {
    if (update.action === 'add') {
      logger.event(`Group ${update.id}: ${update.participants.length} new participant(s)`);
      // optional welcome message
      try {
        for (const p of update.participants) {
          await sock!.sendMessage(update.id, {
            text: `👋 Bem-vindo, @${p.split('@')[0]}!`,
            mentions: [p],
          });
        }
      } catch {}
    }
  });

  return sock;
}
