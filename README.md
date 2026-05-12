# 🤖 Nexus — Advanced WhatsApp AI Agent

Production-ready WhatsApp AI agent built with **Node.js + TypeScript + Baileys**, featuring multi-provider AI (OpenAI, Claude, Gemini), humanized responses, contextual memory, media understanding, and a REST/WebSocket API.

---

## ✨ Features

| | |
|---|---|
| 🧠 **Multi-AI** | OpenAI, Anthropic Claude, Google Gemini with automatic fallback |
| 💬 **Humanized chat** | Typing simulation, realistic delays, chunked messages |
| 🧬 **Long-term memory** | SQLite-backed conversation history + auto-extracted facts |
| 🎭 **9 personalities** | humanized, formal, sales, support, funny, cold, motivator, premium, technical |
| 🎙️ **Voice & audio** | Auto-transcription via Whisper |
| 🖼️ **Vision** | Image understanding (GPT-4o vision / Claude vision / Gemini) |
| 📄 **Documents** | PDF parsing + OCR with Tesseract |
| 🛡️ **Anti-spam** | Per-user rate limits + cooldown |
| 👥 **Group mode** | Mention-only response, moderation, link/word blocking |
| 🔌 **Plugins** | Hot-reload plugin system |
| 🌐 **REST API** | Send messages, manage users, retrieve history |
| 📡 **WebSocket** | Real-time event stream |
| 🪝 **Webhooks** | Forward events to your URL |
| 🐳 **Docker-ready** | Compose stack with Redis |

---

## 🚀 Quick Start

### Option 1 — Local Node.js

```bash
git clone <repo> nexus-agent && cd nexus-agent
npm run setup            # creates folders, .env, installs deps
nano .env                # fill OPENAI_API_KEY (or others)
npm run dev              # starts the agent — scan the QR code
```

### Option 2 — Docker

```bash
cp .env.example .env
nano .env
docker compose up -d
docker compose logs -f agent   # to scan the QR code
```

After scanning, your agent is connected. Session persists in `sessions/`.

---

## 📋 Built-in Commands

| Command | Description |
|---|---|
| `/menu` | List all commands |
| `/ia <pergunta>` | Ask AI anything |
| `/resumir <texto>` | Summarize text |
| `/traduzir <idioma> \| <texto>` | Translate |
| `/copy <produto>` | Generate marketing copy |
| `/pesquisar <termo>` | Web-style research |
| `/imagem` (replying to image) | Analyze image |
| `/ocr` | Extract text from image |
| `/personalidade <id>` | Switch personality |
| `/eusou <info>` | Tell the agent something to remember |
| `/reset` | Wipe conversation memory |
| `/vendas` | Switch to sales mode |
| `/suporte <assunto>` | Open support ticket |
| `/atendimento` | Request human handoff |
| `/stats` (owner) | Bot statistics |
| `/provider <openai\|claude\|gemini>` (owner) | Switch AI provider |

The agent also responds **without commands** — just message it naturally.

---

## 🧩 Architecture

```
src/
├── index.ts                    # Entry point
├── config.ts                   # Centralized config from .env
├── ai/
│   ├── manager.ts              # Provider abstraction (OpenAI/Claude/Gemini)
│   └── conversation.ts         # Context + memory pipeline
├── commands/
│   ├── registry.ts             # Command registry
│   └── index.ts                # All command definitions
├── handlers/
│   └── message.ts              # Central message router
├── services/
│   ├── whatsapp.ts             # Baileys connection
│   ├── messenger.ts            # Humanized send
│   └── media.ts                # Image / audio / PDF / OCR
├── database/
│   └── db.ts                   # SQLite layer
├── personalities/index.ts      # 9 personality presets
├── plugins/
│   ├── manager.ts              # Plugin loader + hot reload
│   └── enabled/                # Drop plugins here
├── events/bus.ts               # Event bus + webhook forwarder
├── api/server.ts               # REST + Socket.io
├── utils/
│   ├── logger.ts               # Colored terminal logger
│   ├── banner.ts               # ASCII boot banner
│   └── helpers.ts              # Delays, chunking, etc.
└── types/index.ts              # Shared types
```

---

## 🎭 Personalities

Switch on the fly: `/personalidade sales`

```
humanized   — friendly, natural, contractions, emojis
formal      — corporate, polished
sales       — SPIN selling, objection handling, consultative
support     — patient, methodical, ticket-aware
funny       — light humor, wordplay
cold        — direct, no fluff
motivator   — coach, energetic
premium     — luxury concierge tone
technical   — precise, expert-level
```

Define your own in `src/personalities/index.ts`.

---

## 🔌 Plugin Example

`src/plugins/enabled/myPlugin.ts`:

```ts
import type { Plugin } from '../../types';

const plugin: Plugin = {
  name: 'myPlugin',
  version: '1.0.0',
  enabled: true,
  async onMessage(ctx) {
    if (ctx.text.toLowerCase() === 'oi bot') {
      const { sendQuick } = await import('../../services/messenger');
      await sendQuick(ctx.sock, ctx.jid, 'Olá! 👋');
      return true; // stops downstream processing
    }
  },
};

export default plugin;
```

Plugins reload automatically in `DEBUG_MODE=true`.

---

## 🌐 REST API

All endpoints require header `X-API-Token: <API_TOKEN>`.

| Method | Path | Body |
|---|---|---|
| GET | `/health` | — |
| POST | `/send` | `{ to, text }` |
| GET | `/users/:jid` | — |
| GET | `/users/:jid/messages?limit=50` | — |
| GET | `/users/:jid/facts` | — |
| POST | `/users/:jid/block` | — |
| POST | `/users/:jid/unblock` | — |
| POST | `/users/:jid/personality` | `{ personality }` |

WebSocket events: `message:received`, `message:sent`, `connection:open`, `connection:close`, `qr`.

```js
const socket = io('http://localhost:3000', { auth: { token: 'YOUR_TOKEN' } });
socket.on('message:received', (m) => console.log('Got:', m));
```

---

## 🪝 Webhooks

Set `WEBHOOK_URL=https://your-server.com/hook` in `.env`. Every event is POSTed:

```json
{ "event": "message:received", "payload": { ... }, "at": 1730000000000 }
```

---

## 🛠️ Configuration Cheatsheet

| Variable | Effect |
|---|---|
| `AI_PROVIDER` | Primary AI: `openai` / `claude` / `gemini` |
| `AGENT_OWNER` | Your number — unlocks admin commands |
| `HUMAN_TYPING_ENABLED` | Toggle typing simulation |
| `HUMAN_TYPING_WPM` | Typing speed |
| `ANTISPAM_MAX_MSGS_PER_MIN` | Hard limit per user |
| `GROUP_RESPOND_ONLY_WHEN_MENTIONED` | Stay silent in groups unless tagged |
| `READ_RECEIPTS` | Send blue ticks |
| `MAX_CONTEXT_MESSAGES` | Memory window per user |

---

## 🐛 Troubleshooting

**QR code not appearing** → Delete `sessions/` and restart.
**"Logged out"** → Phone disconnected. Re-scan.
**Audio not transcribed** → Whisper requires `OPENAI_API_KEY`.
**OCR slow first run** → Tesseract downloads language data once.
**Connection drops** → Auto-reconnects with exponential backoff (max 10 attempts).

---

## 📜 License

MIT. Built with ❤️ for production use.
# IA
# IA
