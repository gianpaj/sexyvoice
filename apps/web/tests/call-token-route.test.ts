import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/call-token/route';
import * as queries from '@/lib/supabase/queries';

// AccessToken signs a JWT locally (no network), so the route is testable.
process.env.LIVEKIT_API_KEY = 'test-livekit-key';
process.env.LIVEKIT_API_SECRET =
  'test-livekit-secret-at-least-32-characters-long';
process.env.LIVEKIT_URL = 'wss://test.livekit.cloud';

type SessionConfigOverride = {
  model?: string;
  voice?: string;
  temperature?: number;
  maxOutputTokens?: number | null;
  audioReferenceId?: string | null;
};

const makeBody = (sessionConfig: SessionConfigOverride = {}) => ({
  instructions: 'Test instructions',
  language: 'en',
  selectedPresetId: null,
  sessionConfig: {
    model: 'grok-voice-think-fast-1.0',
    voice: 'tara',
    temperature: 0.8,
    maxOutputTokens: null,
    audioReferenceId: null,
    ...sessionConfig,
  },
});

const makeRequest = (body: unknown) =>
  new Request('http://localhost/api/call-token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('call-token route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('issues a token for a Grok call (DB voice lookup)', async () => {
    const response = await POST(makeRequest(makeBody()));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.accessToken).toBeDefined();
    expect(queries.getVoiceIdByName).toHaveBeenCalledWith('tara');
  });

  it('resolves an audio reference for inworld-realtime', async () => {
    vi.mocked(queries.hasUserPaid).mockResolvedValue(true);

    const response = await POST(
      makeRequest(
        makeBody({
          model: 'inworld-realtime',
          audioReferenceId: 'test-audio-reference-id',
        }),
      ),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.accessToken).toBeDefined();
    expect(queries.getAudioReferenceById).toHaveBeenCalledWith(
      'test-audio-reference-id',
      'test-user-id',
    );
    // Inworld does not use the public DB voice lookup.
    expect(queries.getVoiceIdByName).not.toHaveBeenCalled();
  });

  it('returns 403 for inworld-realtime when the user has not paid', async () => {
    vi.mocked(queries.hasUserPaid).mockResolvedValue(false);

    const response = await POST(
      makeRequest(
        makeBody({
          model: 'inworld-realtime',
          audioReferenceId: 'test-audio-reference-id',
        }),
      ),
    );

    expect(response.status).toBe(403);
  });

  it('returns 404 for inworld-realtime when the reference is missing', async () => {
    vi.mocked(queries.hasUserPaid).mockResolvedValue(true);
    vi.mocked(queries.getAudioReferenceById).mockResolvedValueOnce({
      data: null,
      error: null,
      // biome-ignore lint/suspicious/noExplicitAny: test mock shape
    } as any);

    const response = await POST(
      makeRequest(
        makeBody({
          model: 'inworld-realtime',
          audioReferenceId: 'missing-id',
        }),
      ),
    );

    expect(response.status).toBe(404);
  });

  it('returns 400 for inworld-realtime when no voice is selected', async () => {
    vi.mocked(queries.hasUserPaid).mockResolvedValue(true);

    const response = await POST(
      makeRequest(
        makeBody({ model: 'inworld-realtime', audioReferenceId: null }),
      ),
    );

    expect(response.status).toBe(400);
  });
});
