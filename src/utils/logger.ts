import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { config } from '../config';

if (!fs.existsSync(config.paths.logs)) {
  fs.mkdirSync(config.paths.logs, { recursive: true });
}

const LOG_FILE = path.join(config.paths.logs, `agent-${new Date().toISOString().split('T')[0]}.log`);

type Level = 'debug' | 'info' | 'success' | 'warn' | 'error' | 'event' | 'ai' | 'msg';

const LEVEL_COLORS: Record<Level, (s: string) => string> = {
  debug:   chalk.gray,
  info:    chalk.cyan,
  success: chalk.green,
  warn:    chalk.yellow,
  error:   chalk.red,
  event:   chalk.magenta,
  ai:      chalk.blueBright,
  msg:     chalk.whiteBright,
};

const LEVEL_TAGS: Record<Level, string> = {
  debug:   '  DEBUG  ',
  info:    '  INFO   ',
  success: ' SUCCESS ',
  warn:    '  WARN   ',
  error:   '  ERROR  ',
  event:   '  EVENT  ',
  ai:      '   AI    ',
  msg:     ' MESSAGE ',
};

function ts(): string {
  return new Date().toISOString().substring(11, 23);
}

function write(level: Level, msg: string, meta?: any) {
  const time = ts();
  const color = LEVEL_COLORS[level];
  const tag = LEVEL_TAGS[level];

  const header = `${chalk.gray(time)} ${color.inverse(tag)}`;
  const body = color(msg);
  let line = `${header} ${body}`;

  if (meta) {
    const metaStr = typeof meta === 'string' ? meta : JSON.stringify(meta);
    line += ' ' + chalk.gray(`→ ${metaStr}`);
  }

  console.log(line);

  // file logging
  try {
    fs.appendFileSync(
      LOG_FILE,
      `[${new Date().toISOString()}] [${level.toUpperCase()}] ${msg} ${meta ? JSON.stringify(meta) : ''}\n`
    );
  } catch {}
}

export const logger = {
  debug:   (m: string, x?: any) => config.logging.debug && write('debug', m, x),
  info:    (m: string, x?: any) => write('info', m, x),
  success: (m: string, x?: any) => write('success', m, x),
  warn:    (m: string, x?: any) => write('warn', m, x),
  error:   (m: string, x?: any) => write('error', m, x),
  event:   (m: string, x?: any) => write('event', m, x),
  ai:      (m: string, x?: any) => write('ai', m, x),
  msg:     (m: string, x?: any) => write('msg', m, x),

  divider: () => console.log(chalk.gray('─'.repeat(70))),
  blank: () => console.log(),
};
