// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

console.log(`Function "telegram-bot" up and running!`);

import {
  Bot,
  webhookCallback,
} from 'https://deno.land/x/grammy@v1.36.3/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.2';

const bot = new Bot(Deno.env.get('TELEGRAM_BOT_TOKEN') || '');

// Initialize Supabase client with admin access
const supabase = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);

// Helper functions for date calculations
function startOfDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function subtractDays(date: Date, days: number): Date {
  return new Date(date.getTime() - days * 86400_000);
}

function formatChange(today: number, yesterday: number): string {
  const diff = today - yesterday;
  return diff >= 0 ? `+${diff}` : `${diff}`;
}

function reduceAmountUsd(acc: number, row: { metadata: any }): number {
  if (!row.metadata || typeof row.metadata !== 'object') {
    return acc;
  }
  const { dollarAmount } = row.metadata as {
    priceId: string;
    dollarAmount: number;
  };
  if (typeof dollarAmount === 'number') {
    return acc + dollarAmount;
  }
  return acc;
}

async function generateLast24HoursStats(): Promise<string> {
  const now = new Date();
  const today = startOfDay(now);
  const previousDay = subtractDays(today, 1);
  const twoDaysAgo = subtractDays(today, 2);
  const sevenDaysAgo = subtractDays(today, 7);
  const thirtyDaysAgo = subtractDays(today, 30);

  try {
    // Audio files stats
    const audioYesterday = await supabase
      .from('audio_files')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', previousDay.toISOString())
      .lt('created_at', today.toISOString());

    const audioPrev = await supabase
      .from('audio_files')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', twoDaysAgo.toISOString())
      .lt('created_at', previousDay.toISOString());

    const audioWeek = await supabase
      .from('audio_files')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', sevenDaysAgo.toISOString())
      .lt('created_at', today.toISOString());

    const audioTotal = await supabase
      .from('audio_files')
      .select('id', { count: 'exact', head: true })
      .lt('created_at', today.toISOString());

    const clonePrevDay = await supabase
      .from('audio_files')
      .select('id', { count: 'exact', head: true })
      .eq('model', 'chatterbox-tts')
      .gte('created_at', previousDay.toISOString())
      .lt('created_at', today.toISOString());

    const cloneWeek = await supabase
      .from('audio_files')
      .select('id', { count: 'exact', head: true })
      .eq('model', 'chatterbox-tts')
      .gte('created_at', sevenDaysAgo.toISOString())
      .lt('created_at', today.toISOString());

    // Profiles stats
    const profilesPrevDay = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', previousDay.toISOString())
      .lt('created_at', today.toISOString());

    const profilesPrev = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', twoDaysAgo.toISOString())
      .lt('created_at', previousDay.toISOString());

    const profilesWeek = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', sevenDaysAgo.toISOString())
      .lt('created_at', today.toISOString());

    const profilesTotal = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .lt('created_at', today.toISOString());

    // Credit transactions stats
    const creditsPrevDay = await supabase
      .from('credit_transactions')
      .select('id', { count: 'exact', head: true })
      .in('type', ['purchase', 'topup'])
      .gte('created_at', previousDay.toISOString())
      .lt('created_at', today.toISOString());

    const creditsPrev = await supabase
      .from('credit_transactions')
      .select('id', { count: 'exact', head: true })
      .in('type', ['purchase', 'topup'])
      .gte('created_at', twoDaysAgo.toISOString())
      .lt('created_at', previousDay.toISOString());

    const creditsWeek = await supabase
      .from('credit_transactions')
      .select('id', { count: 'exact', head: true })
      .in('type', ['purchase', 'topup'])
      .gte('created_at', sevenDaysAgo.toISOString())
      .lt('created_at', today.toISOString());

    const creditsMonth = await supabase
      .from('credit_transactions')
      .select('id', { count: 'exact', head: true })
      .in('type', ['purchase', 'topup'])
      .gte('created_at', thirtyDaysAgo.toISOString())
      .lt('created_at', today.toISOString());

    const creditsTotal = await supabase
      .from('credit_transactions')
      .select('id', { count: 'exact', head: true })
      .in('type', ['purchase', 'topup'])
      .lt('created_at', today.toISOString());

    // Paid users stats
    const { data: paidUsersData } = await supabase
      .from('credit_transactions')
      .select('user_id')
      .in('type', ['purchase', 'topup'])
      .lt('created_at', today.toISOString());

    const totalUniquePaidUsers = paidUsersData
      ? new Set(paidUsersData.map((t) => t.user_id)).size
      : 0;

    // USD revenue stats
    const { data: totalAmountUsdData } = await supabase
      .from('credit_transactions')
      .select('metadata')
      .in('type', ['purchase', 'topup'])
      .lt('created_at', today.toISOString());

    const totalAmountUsd = totalAmountUsdData?.reduce(reduceAmountUsd, 0) ?? 0;

    const { data: totalAmountUsdWeekData } = await supabase
      .from('credit_transactions')
      .select('metadata')
      .in('type', ['purchase', 'topup'])
      .gte('created_at', sevenDaysAgo.toISOString())
      .lt('created_at', today.toISOString());

    const totalAmountUsdWeek =
      totalAmountUsdWeekData?.reduce(reduceAmountUsd, 0) ?? 0;

    const { data: totalAmountUsdMonthData } = await supabase
      .from('credit_transactions')
      .select('metadata')
      .in('type', ['purchase', 'topup'])
      .gte('created_at', thirtyDaysAgo.toISOString())
      .lt('created_at', today.toISOString());

    const totalAmountUsdMonth =
      totalAmountUsdMonthData?.reduce(reduceAmountUsd, 0) ?? 0;

    // Calculate counts
    const audioYesterdayCount = audioYesterday.count ?? 0;
    const audioPrevCount = audioPrev.count ?? 0;
    const audioWeekCount = audioWeek.count ?? 0;
    const audioTotalCount = audioTotal.count ?? 0;
    const clonePrevCount = clonePrevDay.count ?? 0;
    const cloneWeekCount = cloneWeek.count ?? 0;

    const profilesTodayCount = profilesPrevDay.count ?? 0;
    const profilesPrevCount = profilesPrev.count ?? 0;
    const profilesWeekCount = profilesWeek.count ?? 0;
    const profilesTotalCount = profilesTotal.count ?? 0;

    const creditsTodayCount = creditsPrevDay.count ?? 0;
    const creditsPrevCount = creditsPrev.count ?? 0;
    const creditsWeekCount = creditsWeek.count ?? 0;
    const creditsMonthCount = creditsMonth.count ?? 0;
    const creditsTotalCount = creditsTotal.count ?? 0;

    // Format message
    const message = [
      `📊 Daily stats for ${previousDay.toISOString().slice(0, 10)}`,
      `🎵 Audio files: ${audioYesterdayCount} (${formatChange(audioYesterdayCount, audioPrevCount)} from yesterday)`,
      `  • Cloned voices: ${clonePrevCount}`,
      `  • 7d cloned: ${cloneWeekCount}, avg ${(cloneWeekCount / 7).toFixed(1)}`,
      `  • 7d total: ${audioWeekCount}, avg ${(audioWeekCount / 7).toFixed(1)}`,
      `  • Total: ${audioTotalCount}`,
      `👥 Profiles: ${profilesTodayCount} (${formatChange(profilesTodayCount, profilesPrevCount)} from yesterday)`,
      `  • 7d total: ${profilesWeekCount}, avg ${(profilesWeekCount / 7).toFixed(1)}`,
      `  • Total: ${profilesTotalCount}`,
      `💰 Credit Transactions: ${creditsTodayCount} (${formatChange(creditsTodayCount, creditsPrevCount)} from yesterday) ${creditsTodayCount > 0 ? '🤑' : '😿'}`,
      `  • 7d total: ${creditsWeekCount}, avg ${(creditsWeekCount / 7).toFixed(1)}`,
      `  • 30d total: ${creditsMonthCount}, avg ${(creditsMonthCount / 30).toFixed(1)}`,
      `  • Total: ${creditsTotalCount}`,
      `  • Total unique paid users: ${totalUniquePaidUsers}`,
      `💵 Total USD: $${totalAmountUsd.toFixed(2)}`,
      `  • 7d total: $${totalAmountUsdWeek.toFixed(2)}, avg $${(totalAmountUsdWeek / 7).toFixed(2)}`,
      `  • 30d total: $${totalAmountUsdMonth.toFixed(2)}, avg $${(totalAmountUsdMonth / 30).toFixed(2)}`,
    ];

    return message.join('\n');
  } catch (error) {
    console.error('Error generating stats:', error);
    return '❌ Error fetching stats from database. Please try again later.';
  }
}

bot.command('start', (ctx) => ctx.reply('Welcome! Up and running.'));

bot.command('ping', async (ctx) => {
  console.log('ping command received', ctx.chat.id, ctx.from?.id);
  await ctx.reply(`Pong! ${new Date()} ${Date.now()}`);
});

bot.command('stats', async (ctx) => {
  console.log('stats command received', ctx.chat.id, ctx.from?.id);

  try {
    await ctx.reply('📈 Generating stats...');
    const statsMessage = await generateLast24HoursStats();
    await ctx.reply(statsMessage);
  } catch (error) {
    console.error('Error in stats command:', error);
    await ctx.reply('❌ Failed to generate stats. Please try again later.');
  }
});

bot.command('menu', async (ctx) => {
  const mainMenuOptions = {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: 'Help',
            callback_data: 'help',
          },
        ],
        [
          {
            text: 'Stats 📊',
            callback_data: 'stats',
          },
        ],
        [
          {
            text: 'About',
            callback_data: 'about',
          },
        ],
      ],
    },
  };

  await ctx.reply('Choose an option:', mainMenuOptions);
});

// Handle callback queries from inline keyboard
bot.on('callback_query', async (ctx) => {
  const callbackData = ctx.callbackQuery.data;

  await ctx.answerCallbackQuery();

  switch (callbackData) {
    case 'help':
      await ctx.reply(`🤖 Available commands:
/start - Welcome message
/ping - Test bot responsiveness
/stats - Get daily platform statistics
/menu - Show interactive menu

Use /stats to get detailed analytics about the platform.`);
      break;
    case 'stats': {
      await ctx.reply('📈 Generating stats...');
      const statsMessage = await generateLast24HoursStats();
      await ctx.reply(statsMessage);
      break;
    }
    case 'about':
      await ctx.reply(`🎤 SexyVoice.ai Admin Bot

This bot provides real-time statistics and updates for the SexyVoice.ai platform.

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
