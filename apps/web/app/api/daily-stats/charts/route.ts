import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { APIErrorResponse } from '@/lib/error-ts';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  getTelegramBotToken,
  TELEGRAM_ADMIN_CHAT_ID,
  verifyTelegramInitData,
} from '@/lib/telegram';
import { buildDailyChartRows, type ChartsResponse } from '../charts';
import {
  getAudioFilesInRange,
  getCallSessionsInRange,
  getCreditTransactionsInRange,
  getInternalUserIds,
  getProfilesInRange,
} from '../queries';
import {
  CHART_DAYS,
  ROLLING_WINDOW_DAYS,
  startOfDay,
  subtractDays,
} from '../utils';

/**
 * Daily totals for the report's charts Mini App, up to yesterday, excluding
 * internal users. The Mini App authenticates with Telegram init data:
 * `Authorization: tma <init data>`.
 */
export async function GET(request: NextRequest) {
  const botToken = getTelegramBotToken();
  const initData = request.headers
    .get('authorization')
    ?.match(/^tma (.+)$/)?.[1];
  const userId =
    botToken && initData ? verifyTelegramInitData(initData, botToken) : null;
  if (userId !== TELEGRAM_ADMIN_CHAT_ID) {
    return APIErrorResponse('Unauthorized', 401);
  }

  const supabase = createAdminClient();
  const today = startOfDay(new Date());
  const start = subtractDays(today, CHART_DAYS);
  const internalUserIds = await getInternalUserIds(supabase);
  const [audioFiles, calls, creditTransactions, profiles] = await Promise.all([
    getAudioFilesInRange(supabase, start, today, internalUserIds),
    getCallSessionsInRange(supabase, start, today, internalUserIds),
    getCreditTransactionsInRange(supabase, start, today, internalUserIds),
    getProfilesInRange(supabase, start, today, internalUserIds),
  ]);

  return NextResponse.json<ChartsResponse>(
    {
      baselineDays: ROLLING_WINDOW_DAYS,
      days: buildDailyChartRows(
        { audioFiles, calls, creditTransactions, profiles },
        start,
        CHART_DAYS,
      ),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
