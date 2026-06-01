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
  http.get('https://fal-cdn.com/test-enhanced-audio.wav', () => {
    const audioBuffer = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
      0x66, 0x6d, 0x74, 0x20, 0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
      0x44, 0xac, 0x00, 0x00, 0x88, 0x58, 0x01, 0x00, 0x02, 0x00, 0x10, 0x00,
      0x64, 0x61, 0x74, 0x61,
    ]);
    return HttpResponse.arrayBuffer(audioBuffer.buffer, {
      headers: {
        'Content-Type': 'audio/wav',
      },
    });
  }),
  // Mistral speech API mock
  http.post('https://api.mistral.ai/v1/audio/speech', () =>
    HttpResponse.json({
      audio_data: Buffer.from(new Uint8Array(1024)).toString('base64'),
    }),
  ),
];

// Setup MSW server
export const server = setupServer(...handlers);

function installResizeObserverShim() {
  if (typeof globalThis.ResizeObserver === 'function') {
    return;
  }

  globalThis.ResizeObserver = class ResizeObserver {
    disconnect = vi.fn();
    observe = vi.fn();
    unobserve = vi.fn();
  };
}

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });

  if (
    typeof window !== 'undefined' &&
    typeof window.matchMedia !== 'function'
  ) {
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList;
  }

  if (typeof document !== 'undefined') {
    installResizeObserverShim();

    if (typeof document.elementFromPoint !== 'function') {
      document.elementFromPoint = () => document.body;
    }

    const rangePrototype = globalThis.Range?.prototype as
      | (Range & {
          getClientRects?: () => DOMRectList;
          getBoundingClientRect?: () => DOMRect;
        })
      | undefined;

    if (rangePrototype) {
      if (typeof rangePrototype.getClientRects !== 'function') {
        rangePrototype.getClientRects = () =>
          ({
            length: 0,
            item: () => null,
            *[Symbol.iterator]() {},
          }) as DOMRectList;
      }

      if (typeof rangePrototype.getBoundingClientRect !== 'function') {
        rangePrototype.getBoundingClientRect = () => new DOMRect(0, 0, 0, 0);
      }
    }

    const elementPrototype = globalThis.HTMLElement?.prototype as
      | (HTMLElement & {
          getClientRects?: () => DOMRectList;
          getBoundingClientRect?: () => DOMRect;
          scrollIntoView?: () => void;
        })
      | undefined;

    if (elementPrototype) {
      if (typeof elementPrototype.getClientRects !== 'function') {
        elementPrototype.getClientRects = () =>
          ({
            length: 0,
            item: () => null,
            *[Symbol.iterator]() {},
          }) as DOMRectList;
      }

      if (typeof elementPrototype.getBoundingClientRect !== 'function') {
        elementPrototype.getBoundingClientRect = () => new DOMRect(0, 0, 0, 0);
      }

      if (typeof elementPrototype.scrollIntoView !== 'function') {
        elementPrototype.scrollIntoView = vi.fn();
      }
    }
  }
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
process.env.MISTRAL_API_KEY = 'test-mistral-api-key';
process.env.XAI_API_KEY = 'test-xai-key';
process.env.KV_REST_API_URL = 'http://localhost:8079';
process.env.KV_REST_API_TOKEN = 'example_token';
// R2 environment variables
process.env.R2_ENDPOINT = 'https://test-account.r2.cloudflarestorage.com';
process.env.R2_ACCESS_KEY_ID = 'test-r2-access-key';
process.env.R2_SECRET_ACCESS_KEY = 'test-r2-secret-key';
process.env.R2_BUCKET_NAME = 'test-bucket';
process.env.R2_SPEECH_API_BUCKET_NAME = 'test-speech-bucket';
process.env.R2_ACCOUNT_ID = 'test-account-id';
process.env.API_KEY_HMAC_SECRET = 'test-hmac-secret-do-not-use-in-production';
process.env.CLI_LOGIN_ENCRYPTION_SECRET =
  'test-cli-login-secret-do-not-use-in-production';

// Mock Axiom so tests never attempt a real network flush
vi.mock('@axiomhq/js', () => ({
  Axiom: class MockAxiom {
    ingest = vi.fn();
    flush = vi.fn().mockResolvedValue(undefined);
  },
}));

// Mock next/dynamic to render the component directly in tests
vi.mock('next/dynamic', () => ({
  __esModule: true,
  default: (loader: () => Promise<any>) => {
    const { lazy, Suspense, createElement } = require('react');
    const LazyComp = lazy(() =>
      loader().then((resolved: any) => ({
        default:
          typeof resolved === 'function'
            ? resolved
            : resolved.default || resolved,
      })),
    );
    return function DynamicMock(props: any) {
      return createElement(
        Suspense,
        { fallback: null },
        createElement(LazyComp, props),
      );
    };
  },
}));

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
  setUser: vi.fn(),
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

const mockAdminFrom = vi.fn(() => ({
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  or: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn().mockResolvedValue({
    data: {
      id: 'test-api-key-id',
      user_id: 'test-user-id',
      key_hash: 'test-key-hash',
      is_active: true,
      expires_at: null,
    },
    error: null,
  }),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: mockAdminFrom,
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
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
            'lucataco/orpheus-3b-0.1-ft:79f2a473e6a9720716a473d9b2f2951437dbf91dc02ccb7079fb3d89b881207f',
        });
      }
      if (voiceName === 'kore') {
        return Promise.resolve({
          id: 'voice-kore-id',
          name: 'kore',
          language: 'en',
          model: 'gpro',
        });
      }
      if (voiceName === 'eve') {
        return Promise.resolve({
          id: 'voice-eve-id',
          name: 'eve',
          language: 'en',
          model: 'xai',
        });
      }
      if (voiceName === 'sal') {
        return Promise.resolve({
          id: 'voice-sal-id',
          name: 'sal',
          language: 'es-ES',
          model: 'xai',
        });
      }
      return Promise.resolve(null);
    }),
    getVoiceIdByNameAdmin: vi.fn((voiceName: string) => {
      if (voiceName === 'tara') {
        return Promise.resolve({
          id: 'voice-tara-id',
          name: 'tara',
          language: 'en',
          model:
            'lucataco/orpheus-3b-0.1-ft:79f2a473e6a9720716a473d9b2f2951437dbf91dc02ccb7079fb3d89b881207f',
        });
      }
      if (voiceName === 'kore') {
        return Promise.resolve({
          id: 'voice-kore-id',
          name: 'kore',
          language: 'en',
          model: 'gpro',
        });
      }
      if (voiceName === 'eve') {
        return Promise.resolve({
          id: 'voice-eve-id',
          name: 'eve',
          language: 'en',
          model: 'xai',
        });
      }
      if (voiceName === 'sal') {
        return Promise.resolve({
          id: 'voice-sal-id',
          name: 'sal',
          language: 'es-ES',
          model: 'xai',
        });
      }
      return Promise.resolve(null);
    }),
    getCredits: vi.fn().mockResolvedValue(1000),
    getCreditsAdmin: vi.fn().mockResolvedValue(1000),
    reduceCredits: vi.fn().mockResolvedValue(true),
    reduceCreditsAdmin: vi.fn().mockResolvedValue(true),
    saveAudioFile: vi.fn().mockResolvedValue({
      data: { id: 'test-audio-file-id' },
      error: null,
    }),
    saveAudioFileAdmin: vi.fn().mockResolvedValue({
      data: { id: 'test-audio-file-id' },
      error: null,
    }),
    insertUsageEvent: vi.fn().mockResolvedValue('test-usage-event-id'),
    isFreemiumUserOverLimit: vi.fn().mockResolvedValue(false),
    hasUserPaid: vi.fn().mockResolvedValue(false),
    hasUserPaidAdmin: vi.fn().mockResolvedValue(false),
    getLatestCreditAllowanceTransactionAdmin: vi.fn().mockResolvedValue(null),
    reserveCreditAllowanceAlertEmailAdmin: vi.fn().mockResolvedValue(true),
    markCreditAllowanceAlertEmailAdmin: vi.fn().mockResolvedValue(undefined),
    getUserEmailAdmin: vi.fn().mockResolvedValue('test@example.com'),
  };
});

// Mock Upstash Redis with reconfigurable functions
const mockRedisGet = vi.fn().mockResolvedValue(null);
const mockRedisSet = vi.fn().mockResolvedValue('OK');
const mockRedisDel = vi.fn().mockResolvedValue(1);
const mockRedisKeys = vi.fn().mockResolvedValue([]);
const mockRedisIncr = vi.fn().mockResolvedValue(1);
const mockRedisExpire = vi.fn().mockResolvedValue(1);
const mockRedisTtl = vi.fn().mockResolvedValue(60);

const mockRedisInstance = {
  get: mockRedisGet,
  set: mockRedisSet,
  del: mockRedisDel,
  keys: mockRedisKeys,
  incr: mockRedisIncr,
  expire: mockRedisExpire,
  ttl: mockRedisTtl,
};

const mockRatelimitLimit = vi.fn().mockResolvedValue({
  success: true,
  limit: 60,
  remaining: 59,
  reset: Date.now() + 60_000,
});

vi.mock('@upstash/redis', () => ({
  Redis: {
    fromEnv: vi.fn(() => mockRedisInstance),
  },
}));

vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: class MockRatelimit {
    static tokenBucket = vi.fn(() => 'token_bucket_limiter');
    // biome-ignore lint/correctness/noUnusedFunctionParameters: Mirrors SDK constructor shape for tests.
    constructor(_config: unknown) {}
    limit(identifier: string) {
      return mockRatelimitLimit(identifier);
    }
  },
}));

// Export mocks for test access
export {
  mockRatelimitLimit,
  mockRedisDel,
  mockRedisExpire,
  mockRedisGet,
  mockRedisIncr,
  mockRedisKeys,
  mockRedisSet,
  mockRedisTtl,
};

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
        return Promise.resolve(new Blob([audioBuffer], { type: 'audio/wav' }));
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
    audio_file: {
      url: 'https://fal-cdn.com/test-enhanced-audio.wav',
      content_type: 'audio/wav',
      file_name: 'enhanced.wav',
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

// Mock Mistral client
const mockMistralSpeechComplete = vi.fn().mockResolvedValue({
  audioData: new Uint8Array([
    // "RIFF" chunk descriptor
    0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00,
    // "WAVE" format
    0x57, 0x41, 0x56, 0x45,
    // "fmt " subchunk
    0x66, 0x6d, 0x74, 0x20, 0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
    0x44, 0xac, 0x00, 0x00, 0x88, 0x58, 0x01, 0x00, 0x02, 0x00, 0x10, 0x00,
    // "data" subchunk header
    0x64, 0x61, 0x74, 0x61,
  ]),
});

class MockMistral {
  audio = {
    speech: {
      complete: mockMistralSpeechComplete,
    },
  };

  constructor(_: { apiKey: string }) {}
}

vi.mock('@mistralai/mistralai', () => ({
  Mistral: MockMistral,
}));

export { mockMistralSpeechComplete };

// Mock music-metadata for audio duration detection
const mockParseBuffer = vi.fn().mockResolvedValue({
  format: { duration: 12 }, // Default to 12 seconds (valid for Voxtral)
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
