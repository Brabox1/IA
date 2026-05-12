import type { CommandDefinition, MessageContext } from '../types';
import { logger } from '../utils/logger';

class CommandRegistry {
  private commands = new Map<string, CommandDefinition>();
  private aliases = new Map<string, string>();

  register(cmd: CommandDefinition) {
    this.commands.set(cmd.name.toLowerCase(), cmd);
    cmd.aliases?.forEach(a => this.aliases.set(a.toLowerCase(), cmd.name.toLowerCase()));
    logger.debug(`Command registered: /${cmd.name}`);
  }

  resolve(name: string): CommandDefinition | undefined {
    const lower = name.toLowerCase();
    const target = this.aliases.get(lower) || lower;
    return this.commands.get(target);
  }

  list(): CommandDefinition[] {
    return Array.from(this.commands.values());
  }

  byCategory(): Record<string, CommandDefinition[]> {
    const grouped: Record<string, CommandDefinition[]> = {};
    for (const c of this.commands.values()) {
      grouped[c.category] = grouped[c.category] || [];
      grouped[c.category].push(c);
    }
    return grouped;
  }

  async execute(name: string, ctx: MessageContext, args: string[]): Promise<boolean> {
    const cmd = this.resolve(name);
    if (!cmd) return false;

    if (cmd.ownerOnly && !ctx.isOwner) {
      const { sendQuick } = await import('../services/messenger');
      await sendQuick(ctx.sock, ctx.jid, '🔒 Comando restrito ao proprietário.');
      return true;
    }
    if (cmd.groupOnly && !ctx.isGroup) {
      const { sendQuick } = await import('../services/messenger');
      await sendQuick(ctx.sock, ctx.jid, 'Este comando só funciona em grupos.');
      return true;
    }
    if (cmd.privateOnly && ctx.isGroup) {
      const { sendQuick } = await import('../services/messenger');
      await sendQuick(ctx.sock, ctx.jid, 'Este comando só funciona em conversa privada.');
      return true;
    }

    try {
      logger.event(`Command executed: /${cmd.name}`, { from: ctx.sender });
      await cmd.handler(ctx, args);
    } catch (e: any) {
      logger.error(`Command /${cmd.name} failed: ${e.message}`);
      const { sendQuick } = await import('../services/messenger');
      await sendQuick(ctx.sock, ctx.jid, '⚠️ Algo deu errado ao executar este comando.');
    }
    return true;
  }
}

export const registry = new CommandRegistry();
