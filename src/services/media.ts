import { downloadMediaMessage } from '@whiskeysockets/baileys';
import type { proto } from '@whiskeysockets/baileys';
import { logger } from '../utils/logger';
import { ai } from '../ai/manager';

export type MediaKind = 'image' | 'audio' | 'video' | 'document' | 'sticker';

export function detectMediaType(msg: proto.IMessage): MediaKind | undefined {
  if (msg.imageMessage) return 'image';
  if (msg.audioMessage) return 'audio';
  if (msg.videoMessage) return 'video';
  if (msg.documentMessage) return 'document';
  if (msg.stickerMessage) return 'sticker';
  return undefined;
}

export async function downloadMedia(message: proto.IWebMessageInfo): Promise<Buffer | null> {
  try {
    const buffer = await downloadMediaMessage(message, 'buffer', {});
    return buffer as Buffer;
  } catch (e: any) {
    logger.error(`Media download failed: ${e.message}`);
    return null;
  }
}

export async function describeImage(buffer: Buffer, userPrompt?: string): Promise<string> {
  const base64 = buffer.toString('base64');
  const prompt =
    userPrompt ||
    'Descreva em detalhes o que está nesta imagem. Se houver texto, transcreva. Se for documento, extraia as informações relevantes.';
  return ai.vision(base64, prompt);
}

export async function transcribeAudio(buffer: Buffer, mime = 'audio/ogg'): Promise<string> {
  return ai.transcribe(buffer, mime);
}

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  try {
    // @ts-ignore — pdf-parse types
    const pdfParse = (await import('pdf-parse')).default;
    const data = await pdfParse(buffer);
    return data.text;
  } catch (e: any) {
    logger.error(`PDF parse failed: ${e.message}`);
    return '';
  }
}

export async function ocrImage(buffer: Buffer): Promise<string> {
  try {
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('por+eng');
    const { data } = await worker.recognize(buffer);
    await worker.terminate();
    return data.text;
  } catch (e: any) {
    logger.error(`OCR failed: ${e.message}`);
    return '';
  }
}
