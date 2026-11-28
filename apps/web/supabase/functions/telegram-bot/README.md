# Telegram Bot

A Telegram bot for the SexyVoice.ai platform. It answers basic commands and
reads no platform data. The daily report comes from the `/api/daily-stats`
cron, not from this bot.

## Commands

- `/start` - Welcome message
- `/ping` - Test bot responsiveness
- `/menu` - Show the interactive menu (Help and About)
- `/help` - List the commands

## Setup

### Environment Variables

The following environment variables are required:

```bash
TELEGRAM_BOT_TOKEN=your_bot_token_here
FUNCTION_SECRET=your_webhook_secret_here
```

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
- **Runtime**: Deno Deploy
- **Authentication**: Webhook secret validation
