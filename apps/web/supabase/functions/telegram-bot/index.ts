// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

console.log(`Function "telegram-bot" up and running!`);

import {
  Bot,
  webhookCallback,
} from 'https://deno.land/x/grammy@v1.36.3/mod.ts';

const bot = new Bot(Deno.env.get('TELEGRAM_BOT_TOKEN') || '');

bot.command('start', (ctx) => ctx.reply('Welcome! Up and running.'));

bot.command('ping', async (ctx) => {
  console.log('ping command received', ctx.chat.id, ctx.from?.id);
  await ctx.reply(`Pong! ${new Date()} ${Date.now()}`);
});

bot.command('menu', async (ctx) => {
  const mainMenuOptions = {
    reply_markup: {
      inline_keyboard: [
        [
          {
            callback_data: 'help',
            text: 'Help',
          },
        ],
        [
          {
            callback_data: 'about',
            text: 'About',
          },
        ],
      ],
    },
  };

  await ctx.reply('Choose an option:', mainMenuOptions);
});

bot.command('help', async (ctx) => {
  await ctx.reply(helpText);
});

const helpText = `🤖 Available commands:
/start - Welcome message
/ping - Test bot responsiveness
/menu - Show interactive menu`;

// Handle callback queries from inline keyboard
bot.on('callback_query', async (ctx) => {
  const callbackData = ctx.callbackQuery.data;

  await ctx.answerCallbackQuery();

  switch (callbackData) {
    case 'help':
      await ctx.reply(helpText);
      break;
    case 'about':
      await ctx.reply(`🎤 SexyVoice.ai Admin Bot

This bot provides updates for the SexyVoice.ai platform.

Visit: https://sexyvoice.ai`);
      break;
    default:
      await ctx.reply('Unknown option selected.');
  }
});

const handleUpdate = webhookCallback(bot, 'std/http', {
  onTimeout: () => {
    console.log('Timeout occurred');
  },
});

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    if (url.searchParams.get('secret') !== Deno.env.get('FUNCTION_SECRET')) {
      return new Response('not allowed', { status: 405 });
    }

    return await handleUpdate(req);
  } catch (err) {
    console.error(err);
    return new Response('Internal Server Error', { status: 500 });
  }
});
