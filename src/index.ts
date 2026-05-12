import { printBanner } from './utils/banner';
import { logger } from './utils/logger';
import { config } from './config';
import { db } from './database/db';
import { ai } from './ai/manager';
import { startWhatsApp } from './services/whatsapp';
import { startApiServer } from './api/server';
import { pluginManager } from './plugins/manager';

// load command registrations (side-effect import)
import './commands';

async function bootstrap() {
  printBanner();

  // ─── boot order matters ───
  try {
    db.init();
    ai.init();
    await pluginManager.loadAll();
    if (config.logging.debug) pluginManager.watch();

    if (config.api.enabled) startApiServer();

    await startWhatsApp();
  } catch (e: any) {
    logger.error(`Boot failed: ${e.message}`);
    console.error(e);
    process.exit(1);
  }
}

// ─── safety nets ───
process.on('unhandledRejection', (reason: any) => {
  logger.error(`Unhandled rejection: ${reason?.message || reason}`);
});

process.on('uncaughtException', (err) => {
  logger.error(`Uncaught exception: ${err.message}`);
  console.error(err);
});

process.on('SIGINT', () => {
  logger.warn('SIGINT received — shutting down…');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.warn('SIGTERM received — shutting down…');
  process.exit(0);
});

bootstrap();
