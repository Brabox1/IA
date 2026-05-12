import express from 'express';
import http from 'http';
import { Server as SocketServer } from 'socket.io';
import { config } from '../config';
import { logger } from '../utils/logger';
import { db } from '../database/db';
import { events } from '../events/bus';
import { getSocket } from '../services/whatsapp';
import { sendQuick } from '../services/messenger';

export function startApiServer() {
  if (!config.api.enabled) return;

  const app = express();
  app.use(express.json({ limit: '5mb' }));

  // Token auth
  app.use((req, res, next) => {
    if (req.path === '/health') return next();
    const token = req.headers['x-api-token'] || req.query.token;
    if (token !== config.api.token) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    next();
  });

  // ─── routes ───
  app.get('/health', (_req, res) => {
    const sock = getSocket();
    res.json({
      status: 'ok',
      connected: !!sock?.user,
      jid: sock?.user?.id || null,
      provider: config.ai.provider,
      uptime: process.uptime(),
    });
  });

  app.post('/send', async (req, res) => {
    const { to, text } = req.body;
    if (!to || !text) return res.status(400).json({ error: 'to and text required' });
    const sock = getSocket();
    if (!sock) return res.status(503).json({ error: 'whatsapp not connected' });
    const jid = String(to).includes('@') ? to : `${String(to).replace(/\D/g, '')}@s.whatsapp.net`;
    await sendQuick(sock, jid, text);
    res.json({ ok: true });
  });

  app.get('/users/:jid', (req, res) => {
    const u = db.getUser(req.params.jid);
    if (!u) return res.status(404).json({ error: 'user not found' });
    res.json(u);
  });

  app.get('/users/:jid/messages', (req, res) => {
    const limit = parseInt(String(req.query.limit || '50'));
    res.json(db.getRecentMessages(req.params.jid, limit));
  });

  app.get('/users/:jid/facts', (req, res) => {
    res.json(db.getFacts(req.params.jid));
  });

  app.post('/users/:jid/block', (req, res) => {
    db.blockUser(req.params.jid, true);
    res.json({ ok: true });
  });

  app.post('/users/:jid/unblock', (req, res) => {
    db.blockUser(req.params.jid, false);
    res.json({ ok: true });
  });

  app.post('/users/:jid/personality', (req, res) => {
    const { personality } = req.body;
    if (!personality) return res.status(400).json({ error: 'personality required' });
    db.setUserPersonality(req.params.jid, personality);
    res.json({ ok: true });
  });

  // ─── socket.io ───
  const server = http.createServer(app);
  const io = new SocketServer(server, { cors: { origin: '*' } });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (token !== config.api.token) return next(new Error('unauthorized'));
    next();
  });

  io.on('connection', (socket) => {
    logger.info(`Socket client connected: ${socket.id}`);
    socket.emit('hello', { connected: !!getSocket()?.user });
    socket.on('disconnect', () => logger.info(`Socket disconnected: ${socket.id}`));
  });

  // Forward events to all sockets
  events.on('message:received', (ctx: any) => {
    io.emit('message:received', {
      jid: ctx.jid,
      sender: ctx.sender,
      text: ctx.text,
      isGroup: ctx.isGroup,
      pushName: ctx.pushName,
    });
  });
  events.on('message:sent', (data: any) => io.emit('message:sent', data));
  events.on('connection:open', (data: any) => io.emit('connection:open', data));
  events.on('connection:close', (data: any) => io.emit('connection:close', data));
  events.on('qr', (qr: string) => io.emit('qr', qr));

  server.listen(config.api.port, () => {
    logger.success(`API + WebSocket listening on http://localhost:${config.api.port}`);
  });
}
