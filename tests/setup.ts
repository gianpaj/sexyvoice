import type { GenerateContentResponse } from '@google/genai';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';

// Helper to flush pending microtasks and macrotasks in tests
export const flushPromises = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

// Set timezone to UTC for consistent test results across CI and local machines
process.env.TZ = 'UTC';

// Mock handlers for external services
export const handlers = [
  // Replicate API Mock
  http.post('https://api.replicate.com/v1/predictions', () =>
    HttpResponse.json({
      id: 'test-prediction-id',
      status: 'succeeded',
      output: 'https://example.com/audio.mp3',
    }),
  ),
  // Replicate audio file fetch mock
  http.get('https://replicate.delivery/pbxt/test-audio-output.mp3', () => {
    // Return a minimal valid audio buffer
    const audioBuffer = new ArrayBuffer(1024);
    return HttpResponse.arrayBuffer(audioBuffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
      },
    });
  }),
  // fal.ai audio file fetch mock
  http.get('https://fal-cdn.com/test-audio.mp3', () => {
    // Return a minimal valid audio buffer
    const audioBuffer = new ArrayBuffer(1024);
    return HttpResponse.arrayBuffer(audioBuffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
      },
    });
  }),
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
process.env.REPLICATE_API_TOKEN = 'test-replicate-token';
process.env.KV_REST_API_URL = 'http://localhost:8079';
process.env.KV_REST_API_TOKEN = 'example_token';
process.env.BLOB_READ_WRITE_TOKEN = 'test-blob-token';
// R2 environment variables
process.env.R2_ENDPOINT = 'https://test-account.r2.cloudflarestorage.com';
process.env.R2_ACCESS_KEY_ID = 'test-r2-access-key';
process.env.R2_SECRET_ACCESS_KEY = 'test-r2-secret-key';
process.env.R2_BUCKET_NAME = 'test-bucket';
process.env.R2_ACCOUNT_ID = 'test-account-id';

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
  after: async (fn: () => Promise<void>) => {
    // In tests, execute immediately and return a promise
    // This ensures the callback runs before test assertions
    await fn();
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
          model:
            'lucataco/xtts-v2:684bc3855b37866c0c65add2ff39c78f3dea3f4ff103a436465326e0f438d55e',
        });
      }
      if (voiceName === 'poe') {
        return Promise.resolve({
          id: 'voice-poe-id',
          name: 'poe',
          language: 'en',
          model: 'gpro',
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
const mockBlobPut = vi.fn().mockImplementation((filename: string) =>
  Promise.resolve({
    url: `https://blob.vercel-storage.com/${filename}`,
  }),
);
const mockBlobHead = vi.fn().mockRejectedValue(new Error('Not found'));

vi.mock('@vercel/blob', () => ({
  put: mockBlobPut,
  head: mockBlobHead,
}));

// Export mocks for test access
export { mockBlobPut, mockBlobHead };

// Mock R2 Storage
const mockUploadFileToR2 = vi
  .fn()
  .mockImplementation((filename: string) =>
    Promise.resolve(`https://files.sexyvoice.ai/${filename}`),
  );

vi.mock('@/lib/storage/upload', () => ({
  uploadFileToR2: mockUploadFileToR2,
}));

// Export mock for test access
export { mockUploadFileToR2 };

// Mock Stripe client
const mockCheckUserPaidStatus = vi
  .fn()
  .mockResolvedValue({ isPaidUser: false });

vi.mock('@/lib/stripe/stripe-client', () => ({
  checkUserPaidStatus: mockCheckUserPaidStatus,
}));

// Export mock for test access
export { mockCheckUserPaidStatus };

// Mock Google Generative AI module
export const mockCountTokens = vi.fn().mockResolvedValue({ totalTokens: 123 });

// Create a configurable mock instance that tests can modify
const createDefaultGoogleGenAIInstance = () => ({
  models: {
    countTokens: mockCountTokens,
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
      usageMetadata: {
        promptTokenCount: 11,
        candidatesTokenCount: 12,
        totalTokenCount: 23,
      },
    } as GenerateContentResponse),
  },
});

// This function can be overridden by tests to provide custom behavior
let mockGoogleGenAIFactory = createDefaultGoogleGenAIInstance;

// Export functions to control the GoogleGenAI mock
export const setMockGoogleGenAIFactory = (factory: () => any) => {
  mockGoogleGenAIFactory = factory;
};

export const resetMockGoogleGenAIFactory = () => {
  mockGoogleGenAIFactory = createDefaultGoogleGenAIInstance;
};

vi.mock('@google/genai', async () => {
  const genai = await import('@google/genai');
  return {
    HarmBlockThreshold: genai.HarmBlockThreshold,
    HarmCategory: genai.HarmCategory,
    FinishReason: genai.FinishReason,
    GoogleGenAI: class MockGoogleGenAI {
      models: any;
      constructor() {
        const instance = mockGoogleGenAIFactory();
        this.models = instance.models;
      }
    },
  };
});

// Mock crypto.subtle for filename hash generation
Object.defineProperty(global, 'crypto', {
  value: {
    subtle: {
      digest: vi.fn().mockImplementation((_algorithm, data) => {
        // Generate a simple hash based on the input data
        const view = new Uint8Array(data);
        let hash = 0;
        for (let i = 0; i < view.length; i++) {
          // 31 is a common prime number used in hash functions for good distribution
          hash = (hash * 31 + view[i]) & 0xff_ff_ff_ff;
        }
        // Create a Uint8Array with the hash value
        const hashArray = new Uint8Array(16);
        for (let i = 0; i < 16; i++) {
          hashArray[i] = (hash >> (i * 2)) & 0xff;
        }
        return hashArray.buffer;
      }),
    },
  },
});

const mockReplicateRun = vi.fn().mockImplementation((model: string) => {
  // For chatterbox models (voice cloning), return an object with blob() method
  if (model.includes('chatterbox')) {
    return {
      url: () => 'https://replicate.delivery/pbxt/test-audio-output.mp3',
      blob: () => {
        // Return a minimal audio blob
        const audioBuffer = new ArrayBuffer(1024);
        return new Blob([audioBuffer], { type: 'audio/wav' });
      },
    };
  }
  // For other models (generate-voice), return a ReadableStream
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2, 3, 4]));
      controller.close();
    },
  });
});

// Use class syntax for Vitest 4 compatibility with constructor mocking
class MockReplicate {
  run = mockReplicateRun;
}

vi.mock('replicate', () => ({
  default: MockReplicate,
  Replicate: MockReplicate,
}));

export { mockReplicateRun };

// Mock fal.ai client
const mockFalSubscribe = vi.fn().mockImplementation(async () => ({
  data: {
    audio: {
      url: 'https://fal-cdn.com/test-audio.mp3',
      content_type: 'audio/mpeg',
      file_name: 'output.mp3',
      file_size: 1024,
    },
  },
  requestId: 'test-fal-request-id',
}));

vi.mock('@fal-ai/client', () => ({
  fal: {
    subscribe: mockFalSubscribe,
  },
}));

export { mockFalSubscribe };

// Mock music-metadata for audio duration detection
const mockParseBuffer = vi.fn().mockResolvedValue({
  format: { duration: 30 }, // Default to 30 seconds (valid duration)
});

vi.mock('music-metadata', async () => ({
  parseBuffer: mockParseBuffer,
  default: {
    parseBuffer: mockParseBuffer,
  },
}));

export { mockParseBuffer };

// Mock PostHog
vi.mock('@/lib/posthog', () => ({
  default: vi.fn(() => ({
    capture: vi.fn(),
    shutdown: vi.fn().mockResolvedValue(undefined),
  })),
}));

// Mock Inngest client
const mockInngestSend = vi.fn().mockResolvedValue({ ids: ['test-event-id'] });

vi.mock('@/lib/inngest/client', () => ({
  inngest: {
    send: mockInngestSend,
  },
}));

export { mockInngestSend };
