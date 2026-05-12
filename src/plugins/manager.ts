import fs from 'fs';
import path from 'path';
import chokidar from 'chokidar';
import { logger } from '../utils/logger';
import type { Plugin, MessageContext } from '../types';

class PluginManager {
  private plugins = new Map<string, Plugin>();
  private dir = path.join(process.cwd(), 'src', 'plugins', 'enabled');

  async loadAll() {
    if (!fs.existsSync(this.dir)) {
      fs.mkdirSync(this.dir, { recursive: true });
      return;
    }
    const files = fs.readdirSync(this.dir).filter(f => f.endsWith('.ts') || f.endsWith('.js'));
    for (const file of files) {
      await this.load(path.join(this.dir, file));
    }
    logger.success(`Loaded ${this.plugins.size} plugin(s)`);
  }

  async load(filePath: string) {
    try {
      delete require.cache[require.resolve(filePath)];
      const mod = await import(filePath);
      const plugin: Plugin = mod.default || mod;
      if (!plugin?.name) return;
      this.plugins.set(plugin.name, plugin);
      if (plugin.onLoad) await plugin.onLoad();
      logger.info(`Plugin loaded: ${plugin.name} v${plugin.version}`);
    } catch (e: any) {
      logger.error(`Plugin load failed (${filePath}): ${e.message}`);
    }
  }

  async unload(name: string) {
    const p = this.plugins.get(name);
    if (p?.onUnload) await p.onUnload();
    this.plugins.delete(name);
    logger.info(`Plugin unloaded: ${name}`);
  }

  watch() {
    if (!fs.existsSync(this.dir)) return;
    const watcher = chokidar.watch(this.dir, { ignoreInitial: true });
    watcher.on('add', (p) => this.load(p));
    watcher.on('change', (p) => this.load(p));
    watcher.on('unlink', (p) => {
      const name = path.basename(p, path.extname(p));
      this.unload(name);
    });
    logger.info('Hot-reload watching plugins/enabled/');
  }

  async runOnMessage(ctx: MessageContext): Promise<boolean> {
    for (const plugin of this.plugins.values()) {
      if (!plugin.enabled) continue;
      if (plugin.onMessage) {
        try {
          const stop = await plugin.onMessage(ctx);
          if (stop) return true;
        } catch (e: any) {
          logger.error(`Plugin ${plugin.name} error: ${e.message}`);
        }
      }
    }
    return false;
  }
}

export const pluginManager = new PluginManager();
