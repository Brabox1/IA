import figlet from 'figlet';
import chalk from 'chalk';
import boxen from 'boxen';
import { config } from '../config';

export function printBanner() {
  console.clear();
  const banner = figlet.textSync(config.agent.name.toUpperCase(), {
    font: 'ANSI Shadow',
    horizontalLayout: 'default',
  });

  console.log(chalk.cyan(banner));
  console.log(
    boxen(
      chalk.white.bold('  WHATSAPP AI AGENT  ') +
        chalk.gray(' · ') +
        chalk.greenBright('v1.0.0') +
        '\n' +
        chalk.gray('  Multi-skill · Humanized · Production-ready'),
      {
        padding: 1,
        margin: 0,
        borderStyle: 'round',
        borderColor: 'cyan',
        align: 'center',
      }
    )
  );

  console.log();
  console.log(chalk.gray('  ┌─ Provider: ') + chalk.yellowBright(config.ai.provider.toUpperCase()));
  console.log(chalk.gray('  ├─ Personality: ') + chalk.magentaBright(config.agent.defaultPersonality));
  console.log(chalk.gray('  ├─ Language: ') + chalk.greenBright(config.agent.language));
  console.log(chalk.gray('  ├─ Database: ') + chalk.blueBright(config.db.type));
  console.log(chalk.gray('  └─ API: ') + (config.api.enabled ? chalk.greenBright(`http://localhost:${config.api.port}`) : chalk.gray('disabled')));
  console.log();
}

export function printConnected(jid: string) {
  console.log();
  console.log(
    boxen(
      chalk.greenBright.bold('✓ CONNECTED TO WHATSAPP') +
        '\n\n' +
        chalk.gray('Number: ') + chalk.white(jid) +
        '\n' +
        chalk.gray('Status: ') + chalk.greenBright('● ONLINE'),
      {
        padding: 1,
        borderStyle: 'double',
        borderColor: 'green',
        align: 'center',
      }
    )
  );
  console.log();
}
