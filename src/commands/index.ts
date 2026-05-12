import { registry } from './registry';
import { sendQuick, sendHumanized } from '../services/messenger';
import { ai } from '../ai/manager';
import { buildContextAndChat } from '../ai/conversation';
import { listPersonalities, getPersonality } from '../personalities';
import { db } from '../database/db';
import { config } from '../config';
import {
  describeImage,
  downloadMedia,
  extractTextFromPdf,
  transcribeAudio,
  ocrImage,
} from '../services/media';

// ─────────────────────── MENU ───────────────────────
registry.register({
  name: 'menu',
  aliases: ['help', 'ajuda', 'comandos'],
  description: 'Mostra a lista de comandos disponíveis',
  category: 'general',
  handler: async (ctx) => {
    const grouped = registry.byCategory();
    const labels: Record<string, string> = {
      general: '📋 *GERAL*',
      ai: '🧠 *INTELIGÊNCIA*',
      media: '🎨 *MÍDIA*',
      sales: '💼 *VENDAS*',
      support: '🛟 *SUPORTE*',
      admin: '⚙️ *ADMIN*',
      fun: '🎲 *EXTRAS*',
    };

    let text = `*${config.agent.name}* — Assistente IA\n`;
    text += `_Digite o comando que precisar:_\n\n`;

    for (const [cat, list] of Object.entries(grouped)) {
      text += `${labels[cat] || cat.toUpperCase()}\n`;
      for (const c of list) {
        text += `  /${c.name} — ${c.description}\n`;
      }
      text += '\n';
    }

    text += `💡 _Você também pode conversar comigo normalmente. Mando texto, áudio, foto, PDF — entendo tudo._`;
    await sendQuick(ctx.sock, ctx.jid, text);
  },
});

// ─────────────────────── IA ───────────────────────
registry.register({
  name: 'ia',
  aliases: ['ai', 'pergunte'],
  description: 'Pergunte qualquer coisa à IA',
  usage: '/ia <pergunta>',
  category: 'ai',
  handler: async (ctx, args) => {
    if (!args.length) return sendQuick(ctx.sock, ctx.jid, 'Use: /ia <sua pergunta>');
    const q = args.join(' ');
    const reply = await buildContextAndChat(ctx.jid, q, ctx.pushName);
    await sendHumanized(ctx.sock, ctx.jid, reply);
  },
});

registry.register({
  name: 'resumir',
  aliases: ['resumo', 'summary'],
  description: 'Resume o texto enviado',
  usage: '/resumir <texto>',
  category: 'ai',
  handler: async (ctx, args) => {
    const text = args.join(' ');
    if (!text) return sendQuick(ctx.sock, ctx.jid, 'Envie o texto a resumir: /resumir <texto>');
    const res = await ai.chat({
      systemPrompt: 'Você é um especialista em resumos. Faça um resumo claro e conciso do texto fornecido, em bullet points curtos. Mantenha as ideias-chave.',
      messages: [{ role: 'user', content: text, timestamp: Date.now() }],
      temperature: 0.3,
    });
    await sendHumanized(ctx.sock, ctx.jid, res.text);
  },
});

registry.register({
  name: 'traduzir',
  aliases: ['translate', 'tr'],
  description: 'Traduz texto para outro idioma',
  usage: '/traduzir <idioma> | <texto>',
  category: 'ai',
  handler: async (ctx, args) => {
    const raw = args.join(' ');
    const [lang, ...rest] = raw.split('|').map(s => s.trim());
    const text = rest.join('|');
    if (!lang || !text) {
      return sendQuick(ctx.sock, ctx.jid, 'Use: /traduzir <idioma> | <texto>\nEx: /traduzir inglês | Olá, tudo bem?');
    }
    const res = await ai.chat({
      systemPrompt: `Traduza o texto a seguir para ${lang}. Devolva APENAS a tradução, sem comentários.`,
      messages: [{ role: 'user', content: text, timestamp: Date.now() }],
      temperature: 0.2,
    });
    await sendHumanized(ctx.sock, ctx.jid, res.text);
  },
});

registry.register({
  name: 'copy',
  description: 'Gera copy persuasivo de marketing',
  usage: '/copy <descrição do produto>',
  category: 'ai',
  handler: async (ctx, args) => {
    const brief = args.join(' ');
    if (!brief) return sendQuick(ctx.sock, ctx.jid, 'Descreva o produto: /copy <descrição>');
    const res = await ai.chat({
      systemPrompt: 'Você é um copywriter de elite (AIDA + PAS). Crie 3 variações curtas de copy persuasivo para o produto descrito. Cada variação numerada, no estilo WhatsApp (sem markdown pesado).',
      messages: [{ role: 'user', content: brief, timestamp: Date.now() }],
      temperature: 0.85,
    });
    await sendHumanized(ctx.sock, ctx.jid, res.text);
  },
});

registry.register({
  name: 'pesquisar',
  aliases: ['buscar', 'search'],
  description: 'Pesquisa informação na web (via IA)',
  usage: '/pesquisar <termo>',
  category: 'ai',
  handler: async (ctx, args) => {
    const q = args.join(' ');
    if (!q) return sendQuick(ctx.sock, ctx.jid, 'Use: /pesquisar <o que buscar>');
    const reply = await buildContextAndChat(
      ctx.jid,
      `Pesquisa: ${q}`,
      ctx.pushName,
      'Forneça as informações mais úteis e atualizadas que conhece sobre o tópico. Se tiver dúvida sobre atualidade do dado, sinalize.'
    );
    await sendHumanized(ctx.sock, ctx.jid, reply);
  },
});

// ─────────────────────── PERSONALITY ───────────────────────
registry.register({
  name: 'personalidade',
  aliases: ['personality', 'modo'],
  description: 'Muda a personalidade do agent',
  usage: '/personalidade <id>',
  category: 'general',
  handler: async (ctx, args) => {
    if (!args.length) {
      const list = listPersonalities()
        .map(p => `• *${p.id}* — ${p.description}`)
        .join('\n');
      return sendQuick(ctx.sock, ctx.jid, `🎭 *Personalidades disponíveis*\n\n${list}\n\nUse: /personalidade <id>`);
    }
    const id = args[0].toLowerCase();
    const p = getPersonality(id);
    if (p.id !== id) return sendQuick(ctx.sock, ctx.jid, `Personalidade "${id}" não existe. Use /personalidade sem argumentos para ver as opções.`);
    db.upsertUser(ctx.jid, ctx.pushName);
    db.setUserPersonality(ctx.jid, id);
    await sendQuick(ctx.sock, ctx.jid, `✓ Modo *${p.name}* ativado.`);
  },
});

// ─────────────────────── MEMORY ───────────────────────
registry.register({
  name: 'reset',
  aliases: ['clear', 'esquecer'],
  description: 'Apaga o histórico de conversa',
  category: 'general',
  handler: async (ctx) => {
    db.clearMemory(ctx.jid);
    await sendQuick(ctx.sock, ctx.jid, '🧹 Memória limpa. Vamos começar do zero.');
  },
});

registry.register({
  name: 'eusou',
  aliases: ['meunome', 'iam'],
  description: 'Diz seu nome ou uma informação sobre você',
  usage: '/eusou <informação>',
  category: 'general',
  handler: async (ctx, args) => {
    const info = args.join(' ');
    if (!info) return sendQuick(ctx.sock, ctx.jid, 'Ex: /eusou Marco, designer de SP');
    db.setFact(ctx.jid, 'apresentacao', info);
    await sendQuick(ctx.sock, ctx.jid, `Anotado ✓`);
  },
});

// ─────────────────────── MEDIA ───────────────────────
registry.register({
  name: 'imagem',
  aliases: ['analisar', 'verfoto'],
  description: 'Analisa a imagem enviada/citada',
  category: 'media',
  handler: async (ctx, args) => {
    const target = ctx.rawMessage.message?.imageMessage
      ? ctx.rawMessage
      : (ctx.rawMessage.message?.extendedTextMessage?.contextInfo?.quotedMessage
          ? { message: ctx.rawMessage.message.extendedTextMessage.contextInfo.quotedMessage, key: ctx.rawMessage.key }
          : null);

    if (!target) return sendQuick(ctx.sock, ctx.jid, 'Envie uma imagem com /imagem na legenda, ou cite uma imagem.');
    const buffer = await downloadMedia(target as any);
    if (!buffer) return sendQuick(ctx.sock, ctx.jid, 'Não consegui baixar a imagem 😕');
    await sendQuick(ctx.sock, ctx.jid, '🔍 Analisando…');
    const description = await describeImage(buffer, args.join(' ') || undefined);
    await sendHumanized(ctx.sock, ctx.jid, description);
  },
});

registry.register({
  name: 'ocr',
  description: 'Extrai texto de uma imagem',
  category: 'media',
  handler: async (ctx) => {
    if (!ctx.rawMessage.message?.imageMessage) {
      return sendQuick(ctx.sock, ctx.jid, 'Envie uma imagem com /ocr na legenda.');
    }
    const buffer = await downloadMedia(ctx.rawMessage);
    if (!buffer) return sendQuick(ctx.sock, ctx.jid, 'Falha ao baixar a imagem.');
    await sendQuick(ctx.sock, ctx.jid, '🔍 Lendo o texto…');
    const text = await ocrImage(buffer);
    await sendHumanized(ctx.sock, ctx.jid, text || '_(não encontrei texto)_');
  },
});

// ─────────────────────── SALES MODE ───────────────────────
registry.register({
  name: 'vendas',
  description: 'Ativa modo vendedor',
  category: 'sales',
  handler: async (ctx) => {
    db.upsertUser(ctx.jid, ctx.pushName);
    db.setUserPersonality(ctx.jid, 'sales');
    await sendQuick(ctx.sock, ctx.jid, '💼 Modo *Vendas* ativado. Como posso ajudar você hoje?');
  },
});

registry.register({
  name: 'suporte',
  description: 'Ativa modo suporte / abre ticket',
  category: 'support',
  handler: async (ctx, args) => {
    db.upsertUser(ctx.jid, ctx.pushName);
    db.setUserPersonality(ctx.jid, 'support');
    const subject = args.join(' ') || 'Atendimento geral';
    const id = db.createTicket(ctx.jid, subject, 'medium');
    await sendQuick(
      ctx.sock,
      ctx.jid,
      `🎫 Ticket *#${id}* aberto.\nAssunto: _${subject}_\n\nMe descreva o que está acontecendo com o máximo de detalhe.`
    );
  },
});

registry.register({
  name: 'atendimento',
  description: 'Solicita atendimento humano',
  category: 'support',
  handler: async (ctx, args) => {
    const note = args.join(' ') || 'Cliente solicitou atendimento humano';
    db.createTicket(ctx.jid, note, 'high');
    await sendQuick(
      ctx.sock,
      ctx.jid,
      '👤 Encaminhei seu pedido para um atendente humano. Você será contatado em breve.'
    );
  },
});

// ─────────────────────── ADMIN ───────────────────────
registry.register({
  name: 'stats',
  description: 'Estatísticas do bot (owner)',
  category: 'admin',
  ownerOnly: true,
  handler: async (ctx) => {
    const u = db.getUser(ctx.jid);
    await sendQuick(
      ctx.sock,
      ctx.jid,
      `📊 *Status*\n\nProvider: ${config.ai.provider}\nUsuário: ${u?.name}\nMensagens: ${u?.totalMessages}\nPersonalidade: ${u?.personality}`
    );
  },
});

registry.register({
  name: 'provider',
  description: 'Troca provider de IA (owner)',
  usage: '/provider <openai|claude|gemini>',
  category: 'admin',
  ownerOnly: true,
  handler: async (ctx, args) => {
    if (!args.length) return sendQuick(ctx.sock, ctx.jid, 'Use: /provider <openai|claude|gemini>');
    ai.setActive(args[0]);
    await sendQuick(ctx.sock, ctx.jid, `✓ Provider trocado para *${args[0]}*`);
  },
});
