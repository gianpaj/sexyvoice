import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { APIErrorResponse } from '@/lib/error-ts';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  getTelegramBotToken,
  TELEGRAM_ADMIN_CHAT_ID,
  verifyTelegramInitData,
} from '@/lib/telegram';
import { countCallsPerDay } from '../calls';
import { getCallSessionsInRange, getInternalUserIds } from '../queries';
import { startOfDay, subtractDays } from '../utils';

const CHART_DAYS = 30;

/**
 * Calls per UTC day for the daily report's Mini App, up to yesterday. The
 * Mini App authenticates with Telegram init data: `Authorization: tma <data>`.
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
  const calls = await getCallSessionsInRange(
    supabase,
    start,
    today,
    internalUserIds,
  );

  return NextResponse.json(
    { days: countCallsPerDay(calls, start, CHART_DAYS) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
