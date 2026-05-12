import { EventEmitter } from 'events';
import type { EventName } from '../types';
import { config } from '../config';
import axios from 'axios';
import { logger } from '../utils/logger';

class TypedEmitter extends EventEmitter {
  emit(event: EventName | string, ...args: any[]): boolean {
    // forward to webhook if configured
    if (config.api.webhook) {
      axios
        .post(config.api.webhook, { event, payload: args[0], at: Date.now() }, { timeout: 3000 })
        .catch(e => logger.debug(`Webhook error: ${e.message}`));
    }
    return super.emit(event, ...args);
  }
}

export const events = new TypedEmitter();
events.setMaxListeners(50);
