import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config';
import { logger } from '../utils/logger';
import type { AIRequest, AIResponse } from '../types';

export interface AIProvider {
  name: string;
  chat(req: AIRequest): Promise<AIResponse>;
  vision?(imageBase64: string, prompt: string): Promise<string>;
  transcribe?(audioBuffer: Buffer, mime: string): Promise<string>;
}

// ════════════════ OPENAI ════════════════
class OpenAIProvider implements AIProvider {
  name = 'openai';
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({ apiKey: config.ai.openai.apiKey });
  }

  async chat(req: AIRequest): Promise<AIResponse> {
    const messages = [
      { role: 'system' as const, content: req.systemPrompt },
      ...req.messages.map(m => ({ role: m.role as any, content: m.content })),
    ];

    const res = await this.client.chat.completions.create({
      model: req.model || config.ai.openai.model,
      temperature: req.temperature ?? config.ai.openai.temperature,
      max_tokens: req.maxTokens || 800,
      messages,
    });

    return {
      text: res.choices[0]?.message?.content?.trim() || '',
      tokens: res.usage?.total_tokens,
      model: res.model,
      provider: this.name,
    };
  }

  async vision(imageBase64: string, prompt: string): Promise<string> {
    const res = await this.client.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 600,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
          ],
        },
      ],
    });
    return res.choices[0]?.message?.content || '';
  }

  async transcribe(audioBuffer: Buffer, mime: string): Promise<string> {
    const fs = await import('fs');
    const path = await import('path');
    const os = await import('os');
    const ext = mime.includes('ogg') ? 'ogg' : 'mp3';
    const tmpPath = path.join(os.tmpdir(), `audio-${Date.now()}.${ext}`);
    fs.writeFileSync(tmpPath, audioBuffer);
    try {
      const res = await this.client.audio.transcriptions.create({
        file: fs.createReadStream(tmpPath),
        model: 'whisper-1',
      });
      return res.text;
    } finally {
      try { fs.unlinkSync(tmpPath); } catch {}
    }
  }
}

// ════════════════ CLAUDE ════════════════
class ClaudeProvider implements AIProvider {
  name = 'claude';
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({ apiKey: config.ai.claude.apiKey });
  }

  async chat(req: AIRequest): Promise<AIResponse> {
    const res = await this.client.messages.create({
      model: req.model || config.ai.claude.model,
      max_tokens: req.maxTokens || 800,
      temperature: req.temperature ?? 0.7,
      system: req.systemPrompt,
      messages: req.messages
        .filter(m => m.role !== 'system')
        .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    });

    const text = res.content
      .filter((c: any) => c.type === 'text')
      .map((c: any) => c.text)
      .join('\n');

    return {
      text: text.trim(),
      tokens: res.usage.input_tokens + res.usage.output_tokens,
      model: res.model,
      provider: this.name,
    };
  }

  async vision(imageBase64: string, prompt: string): Promise<string> {
    const res = await this.client.messages.create({
      model: config.ai.claude.model,
      max_tokens: 600,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
            { type: 'text', text: prompt },
          ],
        },
      ],
    });
    return res.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n');
  }
}

// ════════════════ GEMINI ════════════════
class GeminiProvider implements AIProvider {
  name = 'gemini';
  private client: GoogleGenerativeAI;

  constructor() {
    this.client = new GoogleGenerativeAI(config.ai.gemini.apiKey);
  }

  async chat(req: AIRequest): Promise<AIResponse> {
    const model = this.client.getGenerativeModel({
      model: req.model || config.ai.gemini.model,
      systemInstruction: req.systemPrompt,
    });

    const history = req.messages.slice(0, -1).map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
    const last = req.messages[req.messages.length - 1];

    const chat = model.startChat({
      history,
      generationConfig: {
        temperature: req.temperature ?? 0.7,
        maxOutputTokens: req.maxTokens || 800,
      },
    });

    const result = await chat.sendMessage(last?.content || '');
    return {
      text: result.response.text().trim(),
      model: req.model || config.ai.gemini.model,
      provider: this.name,
    };
  }

  async vision(imageBase64: string, prompt: string): Promise<string> {
    const model = this.client.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent([
      prompt,
      { inlineData: { data: imageBase64, mimeType: 'image/jpeg' } },
    ]);
    return result.response.text();
  }
}

// ════════════════ FACTORY ════════════════
class AIManager {
  private providers: Record<string, AIProvider> = {};
  private active!: AIProvider;

  init() {
    if (config.ai.openai.apiKey) this.providers.openai = new OpenAIProvider();
    if (config.ai.claude.apiKey) this.providers.claude = new ClaudeProvider();
    if (config.ai.gemini.apiKey) this.providers.gemini = new GeminiProvider();

    const primary = this.providers[config.ai.provider];
    if (!primary) {
      const available = Object.keys(this.providers);
      if (available.length === 0) {
        throw new Error('No AI provider configured. Set OPENAI_API_KEY, ANTHROPIC_API_KEY or GEMINI_API_KEY.');
      }
      logger.warn(`Provider "${config.ai.provider}" not available, using "${available[0]}"`);
      this.active = this.providers[available[0]];
    } else {
      this.active = primary;
    }
    logger.success(`AI Manager ready`, { active: this.active.name, providers: Object.keys(this.providers) });
  }

  async chat(req: AIRequest, providerName?: string): Promise<AIResponse> {
    const provider = providerName ? this.providers[providerName] : this.active;
    if (!provider) throw new Error(`Provider ${providerName} not available`);
    logger.ai(`→ ${provider.name}`, { msgs: req.messages.length, temp: req.temperature });
    try {
      const res = await provider.chat(req);
      logger.ai(`← ${provider.name}`, { tokens: res.tokens, len: res.text.length });
      return res;
    } catch (e: any) {
      logger.error(`AI error (${provider.name}): ${e.message}`);
      // Fallback to another provider
      const others = Object.values(this.providers).filter(p => p !== provider);
      if (others.length > 0) {
        logger.warn(`Falling back to ${others[0].name}`);
        return others[0].chat(req);
      }
      throw e;
    }
  }

  async vision(imageBase64: string, prompt: string): Promise<string> {
    if (this.active.vision) return this.active.vision(imageBase64, prompt);
    for (const p of Object.values(this.providers)) {
      if (p.vision) return p.vision(imageBase64, prompt);
    }
    throw new Error('No vision-capable provider available');
  }

  async transcribe(audio: Buffer, mime: string): Promise<string> {
    if (this.active.transcribe) return this.active.transcribe(audio, mime);
    const openai = this.providers.openai;
    if (openai?.transcribe) return openai.transcribe(audio, mime);
    throw new Error('No transcription-capable provider available (requires OpenAI)');
  }

  setActive(name: string) {
    if (this.providers[name]) {
      this.active = this.providers[name];
      logger.info(`AI provider switched to ${name}`);
    }
  }
}

export const ai = new AIManager();
