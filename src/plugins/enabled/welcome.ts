import type { Plugin } from '../../types';
import { sendQuick } from '../../services/messenger';

const plugin: Plugin = {
  name: 'welcome',
  version: '1.0.0',
  enabled: true,

  onLoad() {
    // could subscribe to other events here
  },

  async onMessage(ctx) {
    // example: trigger welcome on first contact (no DB record = first message)
    // since DB.upsertUser already ran before, we can use a marker fact
    // (kept light to avoid noise in groups)
    return false; // do not stop pipeline
  },
};

export default plugin;
