import type { Route } from '@playwright/test';

import {
  E2E_ALL_TIME_USAGE_SUMMARY_VALUES,
  E2E_MONTHLY_USAGE_SUMMARY_VALUES,
} from '@/lib/e2e-mocks-shared';

/**
 * Usage Dashboard Mock Handlers
 *
 * These handlers mock the /api/usage-events endpoint responses
 * for predictable E2E testing of the usage statistics dashboard.
 */

/**
 * Mock usage event data matching the UsageEvent type
 */
export const mockUsageEvents = [
  {
    credits_used: 12,
    id: 'evt-001',
    metadata: {
      textPreview: 'Hello, this is a test message for voice generation.',
      voiceName: 'Zephyr',
    },
    occurred_at: '2025-01-15T10:30:00.000Z',
    quantity: 150,
    source_type: 'tts',
    unit: 'chars',
    user_id: 'test-user-id',
  },
  {
    credits_used: 50,
    id: 'evt-002',
    metadata: {
      voiceName: 'My Custom Voice',
    },
    occurred_at: '2025-01-14T15:45:00.000Z',
    quantity: 1,
    source_type: 'voice_cloning',
    unit: 'operation',
    user_id: 'test-user-id',
  },
  {
    credits_used: 30,
    id: 'evt-003',
    metadata: {
      textPreview: 'Live call session with AI agent',
      voiceName: 'Ara',
    },
    occurred_at: '2025-01-13T09:00:00.000Z',
    quantity: 3,
    source_type: 'live_call',
    unit: 'mins',
    user_id: 'test-user-id',
  },
  {
    credits_used: 24,
    id: 'evt-004',
    metadata: {
      textPreview: 'Another text-to-speech generation test.',
      voiceName: 'Poe',
    },
    occurred_at: '2025-01-12T14:20:00.000Z',
    quantity: 300,
    source_type: 'tts',
    unit: 'chars',
    user_id: 'test-user-id',
  },
  {
    credits_used: 5,
    id: 'evt-005',
    metadata: {},
    occurred_at: '2025-01-11T11:00:00.000Z',
    quantity: 45,
    source_type: 'audio_processing',
    unit: 'secs',
    user_id: 'test-user-id',
  },
];

/**
 * Mock monthly summary data — shared with the server-side summary-card mock via
 * `lib/e2e-mocks-shared.ts` so the table and the cards can never drift apart.
 */
export const mockMonthlySummary = E2E_MONTHLY_USAGE_SUMMARY_VALUES;

/**
 * Mock all-time summary data — shared source of truth (see above).
 */
export const mockAllTimeSummary = E2E_ALL_TIME_USAGE_SUMMARY_VALUES;

/**
 * Mock paginated response for /api/usage-events
 */
export const mockUsageEventsResponse = {
  allTimeSummary: mockAllTimeSummary,
  data: mockUsageEvents,
  monthlySummary: mockMonthlySummary,
  page: 1,
  pageSize: 20,
  totalCount: mockUsageEvents.length,
  totalPages: 1,
};

/**
 * Handler for GET /api/usage-events
 *
 * Supports query parameters: page, pageSize, sourceType, includeSummary
 */
export async function handleUsageEvents(route: Route) {
  const url = new URL(route.request().url());
  const page = Number.parseInt(url.searchParams.get('page') ?? '1', 10);
  const pageSize = Number.parseInt(
    url.searchParams.get('pageSize') ?? '20',
    10,
  );
  const sourceType = url.searchParams.get('sourceType');
  const includeSummary = url.searchParams.get('includeSummary') === 'true';

  console.log('[MOCK] usage-events called with:', {
    includeSummary,
    page,
    pageSize,
    sourceType,
  });

  // Filter by source type if specified
  let filteredEvents = [...mockUsageEvents];
  if (sourceType && sourceType !== 'all') {
    filteredEvents = filteredEvents.filter(
      (evt) => evt.source_type === sourceType,
    );
  }

  // Paginate
  const startIndex = (page - 1) * pageSize;
  const paginatedEvents = filteredEvents.slice(
    startIndex,
    startIndex + pageSize,
  );

  const response: Record<string, unknown> = {
    data: paginatedEvents,
    page,
    pageSize,
    totalCount: filteredEvents.length,
    totalPages: Math.ceil(filteredEvents.length / pageSize),
  };

  if (includeSummary) {
    response.monthlySummary = mockMonthlySummary;
    response.allTimeSummary = mockAllTimeSummary;
  }

  await route.fulfill({
    body: JSON.stringify(response),
    contentType: 'application/json',
    status: 200,
  });
}

/**
 * Handler for /api/usage-events returning empty data
 */
export async function handleUsageEventsEmpty(route: Route) {
  console.log('[MOCK] usage-events EMPTY handler called');

  const url = new URL(route.request().url());
  const includeSummary = url.searchParams.get('includeSummary') === 'true';

  const responseBody: Record<string, unknown> = {
    data: [],
    page: 1,
    pageSize: 20,
    totalCount: 0,
    totalPages: 0,
  };

  if (includeSummary) {
    const emptySummary = {
      bySourceType: {
        audio_processing: { count: 0, credits: 0 },
        live_call: { count: 0, credits: 0 },
        tts: { count: 0, credits: 0 },
        voice_cloning: { count: 0, credits: 0 },
      },
      totalCredits: 0,
      totalOperations: 0,
    };
    responseBody.monthlySummary = emptySummary;
    responseBody.allTimeSummary = emptySummary;
  }

  await route.fulfill({
    body: JSON.stringify(responseBody),
    contentType: 'application/json',
    status: 200,
  });
}

/**
 * Handler for /api/usage-events returning a server error
 */
export async function handleUsageEventsError(route: Route) {
  console.log('[MOCK] usage-events ERROR handler called');

  await route.fulfill({
    body: JSON.stringify({ error: 'Internal server error' }),
    contentType: 'application/json',
    status: 500,
  });
}

/**
 * Setup default usage mocks
 *
 * Convenience function to set up all usage-related mocks at once.
 */
export async function setupUsageMocks(page: {
  route: (
    url: string,
    handler: (route: Route) => Promise<void>,
  ) => Promise<void>;
}) {
  await page.route('**/api/usage-events*', handleUsageEvents);
}
