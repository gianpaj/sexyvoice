import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/feedback/route';

const { getClaims, rpc } = vi.hoisted(() => ({
  getClaims: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getClaims } }),
}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc }) }));

const userId = 'd3f4a624-c198-46ba-9e2b-49602756119d';
const audioFileId = 'dd8e35f9-fe20-439d-9659-d48f6b60a2f3';
const callTarget = { kind: 'call', roomName: 'voice-chat-ended-room' };
const audioTarget = { audioFileId, kind: 'audio' };

function submit(body: object) {
  return POST(
    new Request('http://localhost/api/feedback', {
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }),
  );
}

describe('POST /api/feedback', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getClaims.mockResolvedValue({ data: { claims: { sub: userId } } });
    rpc.mockResolvedValue({ data: 'down', error: null });
  });

  it('requires a verified session', async () => {
    getClaims.mockResolvedValue({ data: null });
    expect((await submit({ rating: 'down', target: audioTarget })).status).toBe(
      401,
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    { rating: 'down', target: callTarget },
    {
      note: 'Unexpected',
      rating: 'up',
      reasonCode: 'other',
      target: callTarget,
    },
    { rating: 'up', target: { ...audioTarget, roomName: callTarget.roomName } },
    { rating: 'down', target: { ...audioTarget, audioFileId: 'invalid' } },
    { rating: 'up', target: audioTarget, userId: audioFileId },
    {
      note: 'x'.repeat(1001),
      rating: 'down',
      reasonCode: 'other',
      target: callTarget,
    },
  ])('rejects invalid input for $target.kind', async (body) => {
    expect((await submit(body)).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('saves a call reason and note against the caller and room', async () => {
    const response = await submit({
      note: '  The voice drifted. ',
      rating: 'down',
      reasonCode: 'other',
      target: callTarget,
    });

    expect(await response.json()).toEqual({ rating: 'down' });
    expect(rpc).toHaveBeenCalledExactlyOnceWith('save_feedback', {
      p_call_room_name: callTarget.roomName,
      p_note: 'The voice drifted.',
      p_rating: 'down',
      p_reason_code: 'other',
      p_user_id: userId,
    });
  });

  it('uses the saved audio ID for a file rating', async () => {
    const response = await submit({ rating: 'down', target: audioTarget });

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledExactlyOnceWith('save_feedback', {
      p_audio_file_id: audioFileId,
      p_rating: 'down',
      p_user_id: userId,
    });
  });

  it.each([
    ['P0002', 404],
    ['55000', 409],
    ['unexpected', 503],
  ])('maps a target or storage failure to %s', async (code, status) => {
    rpc.mockResolvedValue({ data: null, error: { code } });
    expect((await submit({ rating: 'up', target: callTarget })).status).toBe(
      status,
    );
  });
});
