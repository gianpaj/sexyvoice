# Telegram Bot

A Telegram bot for SexyVoice.ai platform that provides real-time statistics and platform information.

## Features

- 📊 Daily platform statistics
- 🤖 Interactive menu system
- 📈 Real-time database insights
- 🎵 Audio files, user profiles, and credit transaction analytics

## Commands

- `/start` - Welcome message
- `/ping` - Test bot responsiveness
- `/stats` - Get daily platform statistics
- `/menu` - Show interactive menu with callback options

## Setup

### Environment Variables

The following environment variables are required:

```bash
TELEGRAM_BOT_TOKEN=your_bot_token_here
FUNCTION_SECRET=your_webhook_secret_here
SUPABASE_URL=your_supabase_project_url
SUPABASE_SECRET_KEYS='{"default":"sb_secret_xxx"}'
```

Supabase-hosted Edge Functions receive `SUPABASE_URL` and
`SUPABASE_SECRET_KEYS` by default. `SUPABASE_SECRET_KEYS` is a JSON dictionary,
and this function uses its `default` key.

For local development or Deno Deploy, set `SUPABASE_SECRET_KEYS` to the same
JSON shape shown above. The `default` value must be a non-empty Supabase secret
key.

### Deployment

1. Deploy to Deno Deploy

```bash
cd supabase/functions/telegram-bot
deployctl deploy --project=sv-telegram-bot --entrypoint=./index.ts --prod --token=$DENO_TOKEN
```

2. Set up the webhook by navigating to these URLs (replace with your actual tokens and project URL):

```bash
https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook?url=https://sv-telegram-bot.deno.dev?secret=your_function_secret
https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo
```

This sets the webhook URL that Telegram will send updates to when users interact with the bot.

## Architecture

- **Framework**: Grammy (Telegram Bot framework for Deno)
- **Database**: Supabase with admin client access
- **Runtime**: Deno Deploy
- **Authentication**: Webhook secret validation

## Statistics

The `/stats` command provides:
- Audio files generated (yesterday vs previous day comparison)
- New user profiles created
- Credit transactions and revenue
- Weekly totals and averages
- Voice cloning usage statistics
