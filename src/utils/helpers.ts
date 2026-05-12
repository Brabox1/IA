import { config } from '../config';

export const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/**
 * Human-like delay: short for short replies, longer for longer text.
 * Based on words-per-minute typing speed.
 */
export function humanTypingDelay(text: string): number {
  if (!config.behavior.humanTyping) return 0;
  const words = text.trim().split(/\s+/).length;
  const wpm = config.behavior.typingWpm;
  const baseMs = (words / wpm) * 60 * 1000;
  const jitter = Math.random() * 600 - 300;
  return Math.min(
    Math.max(baseMs + jitter, config.behavior.delayMin),
    8000
  );
}

export function randomDelay(min = config.behavior.delayMin, max = config.behavior.delayMax) {
  return Math.floor(Math.random() * (max - min) + min);
}

export function chunkText(text: string, maxLen = 800): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  const sentences = text.split(/(?<=[.!?])\s+/);
  let buf = '';
  for (const s of sentences) {
    if ((buf + ' ' + s).length > maxLen && buf) {
      chunks.push(buf.trim());
      buf = s;
    } else {
      buf = buf ? buf + ' ' + s : s;
    }
  }
  if (buf) chunks.push(buf.trim());
  return chunks;
}

export function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

export function onlyDigits(s: string) {
  return s.replace(/\D/g, '');
}

export function isUrl(s: string): boolean {
  try { new URL(s); return true; } catch { return false; }
}

export function extractLinks(text: string): string[] {
  const re = /https?:\/\/[^\s]+/gi;
  return text.match(re) || [];
}
