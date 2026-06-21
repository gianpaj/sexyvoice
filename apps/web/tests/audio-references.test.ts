import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DELETE } from '@/app/api/audio-references/[id]/route';
import { GET } from '@/app/api/audio-references/route';
import * as queries from '@/lib/supabase/queries';
import { server } from './setup';

const makeContext = (id: string) => ({ params: Promise.resolve({ id }) });

describe('Audio References API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/audio-references', () => {
    it("returns the user's saved voices", async () => {
      vi.mocked(queries.getAudioReferencesForUser).mockResolvedValueOnce({
        data: [
          {
            id: 'ref-1',
            provider: 'inworld',
            voice_id: 'v1',
            name: 'A',
            is_paid: false,
            created_at: null,
          },
        ],
        // biome-ignore lint/suspicious/noExplicitAny: test mock shape
      } as any);

      const request = new Request(
        'http://localhost/api/audio-references?provider=inworld',
      );

      const response = await GET(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(queries.getAudioReferencesForUser).toHaveBeenCalledWith(
        'test-user-id',
        'inworld',
      );
      expect(json.data).toHaveLength(1);
    });

    it('returns 500 when the query fails', async () => {
      vi.mocked(queries.getAudioReferencesForUser).mockResolvedValueOnce({
        data: null,
        error: { message: 'boom' },
        // biome-ignore lint/suspicious/noExplicitAny: test mock shape
      } as any);

      const request = new Request('http://localhost/api/audio-references');

      const response = await GET(request);

      expect(response.status).toBe(500);
    });
  });

  describe('DELETE /api/audio-references/[id]', () => {
    it('deletes the Inworld voice and the DB row', async () => {
      const request = new Request(
        'http://localhost/api/audio-references/ref-1',
        { method: 'DELETE' },
      );

      const response = await DELETE(request, makeContext('ref-1'));

      expect(response.status).toBe(200);
      expect(queries.getAudioReferenceById).toHaveBeenCalledWith(
        'ref-1',
        'test-user-id',
      );
      expect(queries.deleteAudioReference).toHaveBeenCalledWith(
        'ref-1',
        'test-user-id',
      );
    });

    it('returns 404 when the reference is not found', async () => {
      vi.mocked(queries.getAudioReferenceById).mockResolvedValueOnce({
        data: null,
        error: null,
        // biome-ignore lint/suspicious/noExplicitAny: test mock shape
      } as any);

      const request = new Request(
        'http://localhost/api/audio-references/missing',
        { method: 'DELETE' },
      );

      const response = await DELETE(request, makeContext('missing'));

      expect(response.status).toBe(404);
      expect(queries.deleteAudioReference).not.toHaveBeenCalled();
    });

    it('tolerates an Inworld 404 and still removes the DB row', async () => {
      server.use(
        http.delete('https://api.inworld.ai/voices/v1/voices/:voiceId', () =>
          HttpResponse.text('not found', { status: 404 }),
        ),
      );

      const request = new Request(
        'http://localhost/api/audio-references/ref-1',
        { method: 'DELETE' },
      );

      const response = await DELETE(request, makeContext('ref-1'));

      expect(response.status).toBe(200);
      expect(queries.deleteAudioReference).toHaveBeenCalledWith(
        'ref-1',
        'test-user-id',
      );
    });

    it('returns 502 and keeps the DB row when Inworld deletion fails', async () => {
      server.use(
        http.delete('https://api.inworld.ai/voices/v1/voices/:voiceId', () =>
          HttpResponse.text('server error', { status: 500 }),
        ),
      );

      const request = new Request(
        'http://localhost/api/audio-references/ref-1',
        { method: 'DELETE' },
      );

      const response = await DELETE(request, makeContext('ref-1'));

      expect(response.status).toBe(502);
      expect(queries.deleteAudioReference).not.toHaveBeenCalled();
    });
  });
});
