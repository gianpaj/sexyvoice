import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';

// Mock handlers for external services
export const handlers = [
  // DeepInfra API Mock
  http.post(
    'https://api.deepinfra.com/v1/inference/canopylabs/orpheus-3b-0.1-ft',
    async ({ request }) => {
      const body = (await request.json()) as Record<string, any>;

      if (body?.stream) {
        const audioBuffer = Buffer.from([1, 2, 3, 4]);
        return new HttpResponse(audioBuffer, {
          headers: {
            'content-type': 'audio/wav',
          },
        });
      }

      return HttpResponse.json({
        audio: Buffer.from([1, 2, 3, 4]).toString('base64'),
        output_format: body?.response_format ?? 'wav',
        request_id: 'test-request-id',
        inference_status: {
          cost: 0.0001,
          runtime_ms: 1200,
          tokens_generated: 48,
          tokens_input: 12,
          status: 'succeeded',
        },
      });
    },
  ),
];

// Setup MSW server
export const server = setupServer(...handlers);

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});

// Mock environment variables
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'test-gemini-key';
process.env.DEEPINFRA_TOKEN = 'test-deepinfra-token';
process.env.KV_REST_API_URL = 'http://localhost:8079';
process.env.KV_REST_API_TOKEN = 'example_token';
process.env.BLOB_READ_WRITE_TOKEN = 'test-blob-token';

// Mock Next.js modules that aren't available in test environment
vi.mock('next/server', () => ({
  NextResponse: {
    json: (data: any, init?: any) => {
      const response = new Response(JSON.stringify(data), {
        ...init,
        headers: {
          'content-type': 'application/json',
          ...(init?.headers || {}),
        },
      });
      return response;
    },
  },
  after: (fn: () => Promise<void>) => {
    // In tests, execute immediately instead of after response
    return fn();
  },
}));

// Mock Sentry
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock Supabase client
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: {
          user: {
            id: 'test-user-id',
            email: 'test@example.com',
            app_metadata: {},
            user_metadata: {},
          },
        },
        error: null,
      }),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: null,
        error: null,
      }),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
    })),
    rpc: vi.fn().mockResolvedValue({
      data: null,
      error: null,
    }),
  })),
}));

// Mock Supabase queries specifically
vi.mock('@/lib/supabase/queries', async () => {
  const actual = await vi.importActual<typeof import('@/lib/supabase/queries')>(
    '@/lib/supabase/queries',
  );
  return {
    ...actual,
    getVoiceIdByName: vi.fn((voiceName: string) => {
      if (voiceName === 'tara') {
        return Promise.resolve({
          id: 'voice-tara-id',
          name: 'tara',
          language: 'en',
          model: 'canopylabs/orpheus-3b-0.1-ft',
          provider: 'deepinfra',
        });
      }
      if (voiceName === 'poe') {
        return Promise.resolve({
          id: 'voice-poe-id',
          name: 'poe',
          language: 'en',
          model: 'gpro',
          provider: 'google-ai',
        });
      }
      if (voiceName === 'replica') {
        return Promise.resolve({
          id: 'voice-replica-id',
          name: 'replica',
          language: 'en',
          model: 'lucataco/xtts-v2:replicate',
          provider: 'replicate',
        });
      }
      return Promise.resolve(null);
    }),
    getCredits: vi.fn().mockResolvedValue(1000),
    reduceCredits: vi.fn().mockResolvedValue(true),
    saveAudioFile: vi.fn().mockResolvedValue({ id: 'test-audio-file-id' }),
    isFreemiumUserOverLimit: vi.fn().mockResolvedValue(false),
    hasUserPaid: vi.fn().mockResolvedValue(false),
  };
});

// Mock Upstash Redis with reconfigurable functions
const mockRedisGet = vi.fn().mockResolvedValue(null);
const mockRedisSet = vi.fn().mockResolvedValue('OK');
const mockRedisDel = vi.fn().mockResolvedValue(1);
const mockRedisKeys = vi.fn().mockResolvedValue([]);

const mockRedisInstance = {
  get: mockRedisGet,
  set: mockRedisSet,
  del: mockRedisDel,
  keys: mockRedisKeys,
};

vi.mock('@upstash/redis', () => ({
  Redis: {
    fromEnv: vi.fn(() => mockRedisInstance),
  },
}));

// Export mocks for test access
export { mockRedisGet, mockRedisSet, mockRedisDel, mockRedisKeys };

// Mock Vercel Blob
const mockBlobPut = vi.fn().mockResolvedValue({
  url: 'https://blob.vercel-storage.com/test-audio-xyz.wav',
});

vi.mock('@vercel/blob', () => ({
  put: mockBlobPut,
}));

// Export mocks for test access
export { mockBlobPut };

// Mock Replicate client
const mockReplicateRun = vi.fn(
  async (
    _model: string,
    _options: { input: { text: string; voice: string } },
    onProgress?: (prediction: Record<string, any>) => void,
  ) => {
    const prediction = {
      id: 'replicate-prediction-id',
      metrics: { predict_time: 1.23, total_time: 2.34 },
      status: 'succeeded',
    };
    if (onProgress) {
      onProgress(prediction);
    }
    return Buffer.from([9, 8, 7, 6]);
  },
);

class MockReplicate {
  run = mockReplicateRun;
}

vi.mock('replicate', () => ({
  __esModule: true,
  default: MockReplicate,
  Prediction: class {},
}));

export { mockReplicateRun };

// Mock Google Generative AI module
vi.mock('@google/genai', async () => {
  const genai = await import('@google/genai');
  return {
    HarmBlockThreshold: genai.HarmBlockThreshold,
    HarmCategory: genai.HarmCategory,
    FinishReason: genai.FinishReason,
    GoogleGenAI: vi.fn().mockImplementation(() => ({
      models: {
        generateContent: vi.fn().mockResolvedValue({
          candidates: [
            {
              content: {
                parts: [
                  {
                    inlineData: {
                      data: 'UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=',
                      mimeType: 'audio/wav',
                    },
                  },
                ],
              },
              finishReason: 'STOP',
            },
          ],
        }),
      },
    })),
  };
});

// Mock crypto.subtle for filename hash generation
Object.defineProperty(global, 'crypto', {
  value: {
    subtle: {
      digest: vi
        .fn()
        .mockResolvedValue(
          new Uint8Array([
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
          ]),
        ),
    },
  },
});

