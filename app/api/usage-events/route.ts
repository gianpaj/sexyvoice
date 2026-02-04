import * as Sentry from '@sentry/nextjs';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import {
  buildUsageEventsCursors,
  getAllTimeUsageSummary,
  getMonthlyUsageSummary,
  getUsageEventsPaginated,
  type PaginatedUsageEventsResponse,
  type UsageSourceType,
} from '@/lib/supabase/usage-queries';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Authenticate user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse query parameters
    const { searchParams } = request.nextUrl;
    const pageSize = Math.min(
      100,
      Math.max(1, Number.parseInt(searchParams.get('pageSize') ?? '20', 10)),
    );
    const page = Math.max(
      1,
      Number.parseInt(searchParams.get('page') ?? '1', 10),
    );
    const cursor = searchParams.get('cursor');
    const directionParam = searchParams.get('direction');
    const direction =
      directionParam === 'prev' || directionParam === 'next'
        ? directionParam
        : 'next';

    // Validate parsed numbers to prevent NaN propagation
    if (!(Number.isFinite(page) && Number.isFinite(pageSize))) {
      return NextResponse.json(
        { error: 'Invalid page or pageSize parameter' },
        { status: 400 },
      );
    }

    const sourceType = searchParams.get('sourceType') as
      | UsageSourceType
      | undefined;
    const includeSummary = searchParams.get('includeSummary') === 'true';

    // Validate sourceType if provided
    const validSourceTypes: UsageSourceType[] = [
      'tts',
      'voice_cloning',
      'live_call',
      'audio_processing',
    ];
    if (sourceType && !validSourceTypes.includes(sourceType)) {
      return NextResponse.json(
        { error: 'Invalid sourceType parameter' },
        { status: 400 },
      );
    }

    // Fetch paginated usage events
    const { data, totalCount } = await getUsageEventsPaginated(
      supabase,
      user.id,
      {
        pageSize,
        sourceType: sourceType || undefined,
        cursor: cursor || undefined,
        direction,
      },
    );

    const { nextCursor, prevCursor } = buildUsageEventsCursors(data);

    const response: PaginatedUsageEventsResponse & {
      monthlySummary?: Awaited<ReturnType<typeof getMonthlyUsageSummary>>;
      allTimeSummary?: Awaited<ReturnType<typeof getAllTimeUsageSummary>>;
    } = {
      data,
      totalCount,
      page,
      pageSize,
      totalPages: Math.ceil(totalCount / pageSize),
      nextCursor,
      prevCursor,
    };

    // Include summary data if requested (typically for first page load)
    if (includeSummary) {
      const [monthlySummary, allTimeSummary] = await Promise.all([
        getMonthlyUsageSummary(supabase, user.id),
        getAllTimeUsageSummary(supabase, user.id),
      ]);
      response.monthlySummary = monthlySummary;
      response.allTimeSummary = allTimeSummary;
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('Failed to fetch usage events:', error);
    Sentry.captureException(error);
    return NextResponse.json(
      { error: 'Failed to fetch usage events' },
      { status: 500 },
    );
  }
}
