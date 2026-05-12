import { db } from '../database/db';
import { config } from '../config';
import { getPersonality } from '../personalities';
import { ai } from './manager';
import type { MemoryMessage } from '../types';

/**
 * Builds the full context for an AI request:
 * - personality system prompt
 * - long-term facts about the user
 * - recent conversation memory
 */
export async function buildContextAndChat(
  jid: string,
  userMessage: string,
  pushName: string,
  extraSystem?: string
): Promise<string> {
  const user = db.getUser(jid);
  const personality = getPersonality(user?.personality || config.agent.defaultPersonality);
  const facts = db.getFacts(jid);

  // factual block
  let factsBlock = '';
  if (Object.keys(facts).length > 0) {
    factsBlock = '\n\nO que você sabe sobre este usuário:\n';
    for (const [k, v] of Object.entries(facts)) {
      factsBlock += `- ${k}: ${v}\n`;
    }
  }
  if (user?.notes) {
    factsBlock += `\nObservações: ${user.notes}\n`;
  }

  const systemPrompt =
    personality.systemPrompt +
    `\n\nNome do usuário: ${pushName || user?.name || 'desconhecido'}.` +
    factsBlock +
    (extraSystem ? `\n\nContexto adicional:\n${extraSystem}` : '');

  // recent history
  const history = db.getRecentMessages(jid, config.behavior.maxContext);
  const messages: MemoryMessage[] = [
    ...history,
    { role: 'user', content: userMessage, timestamp: Date.now() },
  ];

  const res = await ai.chat({
    systemPrompt,
    messages,
    temperature: personality.temperature,
  });

  // Save both sides
  db.saveMessage(jid, 'user', userMessage);
  db.saveMessage(jid, 'assistant', res.text);

  // Periodically extract facts (every 8 messages, async, non-blocking)
  if (user && user.totalMessages > 0 && user.totalMessages % 8 === 0) {
    extractFactsAsync(jid, messages, res.text);
  }

  return res.text;
}

/**
 * Background fact extraction — uses cheap call to detect things to remember
 */
async function extractFactsAsync(jid: string, msgs: MemoryMessage[], lastReply: string) {
  try {
    const recent = msgs.slice(-6).map(m => `${m.role}: ${m.content}`).join('\n');
    const res = await ai.chat({
      systemPrompt:
        'You extract long-term facts about a user from a chat snippet. ' +
        'Return ONLY a JSON array of {"key":"...","value":"..."} for stable facts ' +
        '(name, location, profession, preferences, family, goals). ' +
        'Skip transient stuff. Return [] if nothing notable. NO prose, JSON only.',
      messages: [{ role: 'user', content: recent, timestamp: Date.now() }],
      temperature: 0.1,
      maxTokens: 300,
    });
    const match = res.text.match(/\[.*\]/s);
    if (!match) return;
    const facts = JSON.parse(match[0]) as Array<{ key: string; value: string }>;
    for (const f of facts) {
      if (f.key && f.value) db.setFact(jid, f.key.toLowerCase().slice(0, 40), f.value.slice(0, 200));
    }
  } catch {
    // silent — fact extraction is best-effort
  }
}

/**
 * Quick utility: classify intent for routing
 */
export async function classifyIntent(text: string): Promise<string> {
  try {
    const res = await ai.chat({
      systemPrompt:
        'Classifique a intenção da mensagem em UMA palavra: greeting, question, sales, support, complaint, smalltalk, command, media, other. Responda apenas a palavra.',
      messages: [{ role: 'user', content: text, timestamp: Date.now() }],
      temperature: 0.1,
      maxTokens: 10,
    });
    return res.text.toLowerCase().trim().split(/\s/)[0];
  } catch {
    return 'other';
  }
}
