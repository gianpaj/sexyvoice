import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DELETE } from '@/app/api/audio-references/[id]/route';
import { GET, POST } from '@/app/api/audio-references/route';
import * as queries from '@/lib/supabase/queries';
import { server } from './setup';

const makeContext = (id: string) => ({ params: Promise.resolve({ id }) });

// Minimal valid WAV file (audio/wav skips server-side conversion; duration is mocked).
const makeWavFile = () => {
  const header = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
    0x66, 0x6d, 0x74, 0x20, 0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
    0x44, 0xac, 0x00, 0x00, 0x88, 0x58, 0x01, 0x00, 0x02, 0x00, 0x10, 0x00,
    0x64, 0x61, 0x74, 0x61, 0x00, 0x00, 0x00, 0x00,
  ]);
  return new File([header], 'sample.wav', { type: 'audio/wav' });
};

const makeCreateForm = (overrides: { name?: string; locale?: string } = {}) => {
  const formData = new FormData();
  formData.append('file', makeWavFile());
  formData.append('name', overrides.name ?? 'My Voice');
  formData.append('locale', overrides.locale ?? 'en');
  return formData;
};

const makeCreateRequest = (formData: FormData) =>
  new Request('http://localhost/api/audio-references', {
    method: 'POST',
    body: formData,
  });

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

  describe('POST /api/audio-references', () => {
    it('mints an Inworld voice from an upload for a paid user', async () => {
      vi.mocked(queries.hasUserPaid).mockResolvedValue(true);

      const response = await POST(makeCreateRequest(makeCreateForm()));
      const json = await response.json();

      expect(response.status).toBe(201);
      expect(queries.insertAudioReference).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'test-user-id',
          provider: 'inworld',
          name: 'My Voice',
          isPaid: true,
        }),
      );
      expect(json.data).toMatchObject({ id: 'test-audio-reference-id' });
    });

    it('returns 403 when the user has not paid', async () => {
      vi.mocked(queries.hasUserPaid).mockResolvedValue(false);

      const response = await POST(makeCreateRequest(makeCreateForm()));

      expect(response.status).toBe(403);
      expect(queries.insertAudioReference).not.toHaveBeenCalled();
    });

    it('returns 400 when the name is missing', async () => {
      vi.mocked(queries.hasUserPaid).mockResolvedValue(true);

      const response = await POST(
        makeCreateRequest(makeCreateForm({ name: '' })),
      );

      expect(response.status).toBe(400);
      expect(queries.insertAudioReference).not.toHaveBeenCalled();
    });

    it('rolls back the Inworld voice when the insert fails', async () => {
      vi.mocked(queries.hasUserPaid).mockResolvedValue(true);
      vi.mocked(queries.insertAudioReference).mockResolvedValueOnce({
        data: null,
        error: { message: 'unique violation' },
        // biome-ignore lint/suspicious/noExplicitAny: test mock shape
      } as any);

      let inworldDeleteCalled = false;
      server.use(
        http.delete('https://api.inworld.ai/voices/v1/voices/:voiceId', () => {
          inworldDeleteCalled = true;
          return HttpResponse.json({});
        }),
      );

      const response = await POST(makeCreateRequest(makeCreateForm()));

      expect(response.status).toBe(500);
      expect(inworldDeleteCalled).toBe(true);
    });
  });
});
