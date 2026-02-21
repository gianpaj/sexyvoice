import type { Route } from '@playwright/test';

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
    id: 'evt-001',
    user_id: 'test-user-id',
    source_type: 'tts',
    quantity: 150,
    unit: 'chars',
    credits_used: 12,
    occurred_at: new Date().toISOString(),
    metadata: {
      voiceName: 'Zephyr',
      textPreview: 'Hello, this is a test message for voice generation.',
    },
  },
  {
    id: 'evt-002',
    user_id: 'test-user-id',
    source_type: 'voice_cloning',
    quantity: 1,
    unit: 'operation',
    credits_used: 50,
    occurred_at: new Date(Date.now() - 86_400_000).toISOString(), // 1 day ago
    metadata: {
      voiceName: 'My Custom Voice',
    },
  },
  {
    id: 'evt-003',
    user_id: 'test-user-id',
    source_type: 'live_call',
    quantity: 3,
    unit: 'mins',
    credits_used: 30,
    occurred_at: new Date(Date.now() - 172_800_000).toISOString(), // 2 days ago
    metadata: {
      voiceName: 'Ara',
      textPreview: 'Live call session with AI agent',
    },
  },
  {
    id: 'evt-004',
    user_id: 'test-user-id',
    source_type: 'tts',
    quantity: 300,
    unit: 'chars',
    credits_used: 24,
    occurred_at: new Date(Date.now() - 259_200_000).toISOString(), // 3 days ago
    metadata: {
      voiceName: 'Poe',
      textPreview: 'Another text-to-speech generation test.',
    },
  },
  {
    id: 'evt-005',
    user_id: 'test-user-id',
    source_type: 'audio_processing',
    quantity: 45,
    unit: 'secs',
    credits_used: 5,
    occurred_at: new Date(Date.now() - 345_600_000).toISOString(), // 4 days ago
    metadata: {},
  },
];

/**
 * Mock monthly summary data
 */
export const mockMonthlySummary = {
  totalCredits: 121,
  totalOperations: 5,
  bySourceType: {
    tts: { credits: 36, count: 2 },
    voice_cloning: { credits: 50, count: 1 },
    live_call: { credits: 30, count: 1 },
    audio_processing: { credits: 5, count: 1 },
  },
};

/**
 * Mock all-time summary data
 */
export const mockAllTimeSummary = {
  totalCredits: 542,
  totalOperations: 23,
  bySourceType: {
    tts: { credits: 250, count: 12 },
    voice_cloning: { credits: 150, count: 3 },
    live_call: { credits: 120, count: 6 },
    audio_processing: { credits: 22, count: 2 },
  },
};

/**
 * Mock paginated response for /api/usage-events
 */
export const mockUsageEventsResponse = {
  data: mockUsageEvents,
  totalCount: mockUsageEvents.length,
  totalPages: 1,
  currentPage: 1,
  pageSize: 20,
  monthlySummary: mockMonthlySummary,
  allTimeSummary: mockAllTimeSummary,
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
    page,
    pageSize,
    sourceType,
    includeSummary,
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
    totalCount: filteredEvents.length,
    totalPages: Math.max(1, Math.ceil(filteredEvents.length / pageSize)),
    currentPage: page,
    pageSize,
  };

  if (includeSummary) {
    response.monthlySummary = mockMonthlySummary;
    response.allTimeSummary = mockAllTimeSummary;
  }

  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(response),
  });
}

/**
 * Handler for /api/usage-events returning empty data
 */
export async function handleUsageEventsEmpty(route: Route) {
  console.log('[MOCK] usage-events EMPTY handler called');

  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      data: [],
      totalCount: 0,
      totalPages: 0,
      currentPage: 1,
      pageSize: 20,
      monthlySummary: {
        totalCredits: 0,
        totalOperations: 0,
        bySourceType: {
          tts: { credits: 0, count: 0 },
          voice_cloning: { credits: 0, count: 0 },
          live_call: { credits: 0, count: 0 },
          audio_processing: { credits: 0, count: 0 },
        },
      },
      allTimeSummary: {
        totalCredits: 0,
        totalOperations: 0,
        bySourceType: {
          tts: { credits: 0, count: 0 },
          voice_cloning: { credits: 0, count: 0 },
          live_call: { credits: 0, count: 0 },
          audio_processing: { credits: 0, count: 0 },
        },
      },
    }),
  });
}

/**
 * Handler for /api/usage-events returning a server error
 */
export async function handleUsageEventsError(route: Route) {
  console.log('[MOCK] usage-events ERROR handler called');

  await route.fulfill({
    status: 500,
    contentType: 'application/json',
    body: JSON.stringify({ error: 'Internal server error' }),
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
