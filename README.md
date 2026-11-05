# DRIP.AI

DRIP.AI is a Discord bot that brings conversational AI into a server with
short, context-aware replies and configurable channel behavior.

The project is built around a provider-fallback design: Gemini is tried first,
then configured OpenAI-compatible providers can take over when a provider is
unavailable or temporarily rate-limited.

## Features

- Discord message handling with `discord.js`
- Gemini integration through `@google/genai`
- Optional OpenAI-compatible fallback providers
- Configurable bot persona and name triggers
- Recent-message transcript context
- Direct replies through mentions, replies, or configured name triggers
- Optional probabilistic replies in selected channels
- Per-channel cooldowns and daily auto-reply limits
- Provider/model cooldown tracking after rate limits or service failures
- Minimal Express health endpoint for hosting platforms
- Safe Discord mention handling to prevent model-generated pings

## Technologies

- Node.js 20+
- JavaScript
- Discord API
- Google Gemini API
- Express
- `fetch` for OpenAI-compatible APIs

## Setup

```bash
git clone https://github.com/yoitsrayyan/DRIP.AI.git
cd DRIP.AI
npm install
cp .env.example .env
npm start
```

Create a Discord application and configure its token and message-content
intent before starting the bot. API keys and server-specific channel IDs must
stay in `.env`; never commit them.

## Configuration

The main settings are read from environment variables, including:

- `DISCORD_TOKEN`
- `GEMINI_API_KEY` and optional numbered Gemini keys
- Optional `GROQ_API_KEY`, `CEREBRAS_API_KEY`, `MISTRAL_API_KEY`, and
  `OPENROUTER_API_KEY`
- `CHAT_CHANNEL_IDS`
- `IGNORED_CHANNEL_IDS`
- `NAME_TRIGGERS`
- `BOT_PERSONA`
- `HISTORY_LIMIT`
- `AUTOREPLY_CHANCE`
- `AUTOREPLY_COOLDOWN_SEC`
- `AUTOREPLY_DAILY_MAX`

See `.env.example` for the expected variable names.

## Architecture

Incoming Discord messages pass through filtering and routing logic. Direct
messages are always eligible for a response, while ordinary messages must pass
channel, cooldown, probability, and daily-budget checks. The selected AI
provider receives the configured persona, recent transcript, and new message.

If a provider fails, the bot records a temporary cooldown and tries the next
available provider. This keeps the bot responsive without hiding credentials
or hard-coding server configuration in the source.

## Project status

This is a personal, actively evolving project. The code is currently centered
in `index.js`; future cleanup may split provider adapters, configuration, and
Discord event handling into separate modules.
