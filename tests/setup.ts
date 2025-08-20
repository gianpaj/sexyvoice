import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';

// Mock handlers for external services
export const handlers = [
  // Supabase Auth Mock - multiple endpoints for different auth methods
  // http.get('https://*.supabase.co/auth/v1/user', () => {
  //   return HttpResponse.json({
  //     user: {
  //       id: 'test-user-id',
  //       email: 'test@example.com',
  //       app_metadata: {},
  //       user_metadata: {},
  //     },
  //   });
  // }),

  // SSR auth endpoint
  http.post('https://*.supabase.co/auth/v1/token', () => {
    return HttpResponse.json({
      access_token: 'test-access-token',
      token_type: 'bearer',
      expires_in: 3600,
      refresh_token: 'test-refresh-token',
      user: {
        id: 'test-user-id',
        email: 'test@example.com',
        app_metadata: {},
        user_metadata: {},
      },
    });
  }),

  // Additional auth endpoints that might be used by SSR
  http.get('https://*.supabase.co/auth/v1/token', () => {
    return HttpResponse.json({
      user: {
        id: 'test-user-id',
        email: 'test@example.com',
        app_metadata: {},
        user_metadata: {},
      },
    });
  }),

  // Supabase Database Mocks
  http.get('https://*.supabase.co/rest/v1/credits', ({ request }) => {
    const url = new URL(request.url);
    // if (url.searchParams.get('user_id')) {
    //   return HttpResponse.json([{ amount: 1000 }]);
    // }
    return HttpResponse.json([]);
  }),

  http.get('https://*.supabase.co/rest/v1/voices', ({ request }) => {
    const url = new URL(request.url);
    const voice = url.searchParams.get('name')?.replace('eq.', '');

    if (voice === 'tara') {
      return HttpResponse.json([
        {
          id: 'voice-tara-id',
          name: 'tara',
          language: 'en',
          model:
            'lucataco/xtts-v2:684bc3855b37866c0c65add2ff39c78f3dea3f4ff103a436465326e0f438d55e',
        },
      ]);
    }

    if (voice === 'poe') {
      return HttpResponse.json([
        {
          id: 'voice-poe-id',
          name: 'poe',
          language: 'en',
          model: 'gpro',
        },
      ]);
    }

    return HttpResponse.json([]);
  }),

  http.patch('https://*.supabase.co/rest/v1/credits', () => {
    return HttpResponse.json({ success: true });
  }),

  http.post('https://*.supabase.co/rest/v1/audio_files', () => {
    return HttpResponse.json({
      id: 'test-audio-file-id',
      success: true,
    });
  }),

  http.post('https://*.supabase.co/rest/v1/rpc/increment_user_credits', () => {
    return HttpResponse.json({ success: true });
  }),

  // Replicate API Mock
  http.post('https://api.replicate.com/v1/predictions', () => {
    return HttpResponse.json({
      id: 'test-prediction-id',
      status: 'succeeded',
      output: 'https://example.com/audio.mp3',
    });
  }),

  // Upstash Redis Mock
  // http.get('https://*.upstash.io/*', ({ request }) => {
  //   const url = new URL(request.url);

  //   if (url.pathname.includes('/get/')) {
  //     // Return null for cache miss
  //     return HttpResponse.json({ result: null });
  //   }
  //   return HttpResponse.json({ result: 'OK' });
  // }),

  // http.post('https://*.upstash.io/*', ({ request }) => {
  //   const url = new URL(request.url);
  //   console.log({ request });
  //   if (url.pathname.includes('/set/')) {
  //     return HttpResponse.json({ result: 'OK' });
  //   }
  //   return HttpResponse.json({ result: 'OK' });
  // }),

  // Vercel Blob Storage Mock
  http.put('https://blob.vercel-storage.com/*', () => {
    return HttpResponse.json({
      url: 'https://blob.vercel-storage.com/test-audio-xyz.wav',
      downloadUrl: 'https://blob.vercel-storage.com/test-audio-xyz.wav',
      pathname: 'test-audio-xyz.wav',
    });
  }),

  // PostHog Mock
  http.post('https://us.i.posthog.com/capture/', () => {
    return HttpResponse.json({ success: true });
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

// Polyfill Response for test environment
// if (!global.Response) {
//   global.Response = class Response {
//     body: ReadableStream | null;
//     status: number;
//     statusText: string;
//     headers: Headers;
//     ok: boolean;
//     redirected: boolean;
//     type: ResponseType;
//     url: string;
//     private _bodyText: string;

//     constructor(body?: BodyInit | null, init?: ResponseInit) {
//       this.status = init?.status || 200;
//       this.statusText = init?.statusText || '';
//       this.headers = new Headers(init?.headers);
//       this.ok = this.status >= 200 && this.status < 300;
//       this.redirected = false;
//       this.type = 'basic' as ResponseType;
//       this.url = '';

//       if (body === null || body === undefined) {
//         this._bodyText = '';
//         this.body = null;
//       } else if (typeof body === 'string') {
//         this._bodyText = body;
//         this.body = null; // Simplified for tests
//       } else {
//         this._bodyText = String(body);
//         this.body = null;
//       }
//     }

//     async text(): Promise<string> {
//       return this._bodyText;
//     }

//     async json(): Promise<any> {
//       return JSON.parse(this._bodyText);
//     }

//     async blob(): Promise<Blob> {
//       return new Blob([this._bodyText]);
//     }

//     async arrayBuffer(): Promise<ArrayBuffer> {
//       return new TextEncoder().encode(this._bodyText).buffer;
//     }

//     clone(): Response {
//       return new Response(this._bodyText, {
//         status: this.status,
//         statusText: this.statusText,
//         headers: this.headers,
//       });
//     }
//   } as any;
// }

// Polyfill Request for test environment
// if (!global.Request) {
//   global.Request = class Request {
//     url: string;
//     method: string;
//     headers: Headers;
//     body: ReadableStream | null;
//     private _bodyText: string | null;
//     private _bodyUsed: boolean = false;

//     constructor(input: RequestInfo | URL, init?: RequestInit) {
//       this.url = typeof input === 'string' ? input : input.toString();
//       this.method = init?.method || 'GET';
//       this.headers = new Headers(init?.headers);

//       if (init?.body === null || init?.body === undefined) {
//         this._bodyText = null;
//         this.body = null;
//       } else if (typeof init?.body === 'string') {
//         this._bodyText = init.body;
//         this.body = null;
//       } else {
//         this._bodyText = String(init?.body);
//         this.body = null;
//       }
//     }

//     async json(): Promise<any> {
//       if (this._bodyUsed) {
//         throw new TypeError('body used already');
//       }
//       this._bodyUsed = true;

//       if (this._bodyText === null) {
//         throw new SyntaxError('Unexpected end of JSON input');
//       }

//       return JSON.parse(this._bodyText);
//     }

//     async text(): Promise<string> {
//       if (this._bodyUsed) {
//         throw new TypeError('body used already');
//       }
//       this._bodyUsed = true;
//       return this._bodyText || '';
//     }

//     clone(): Request {
//       return new Request(this.url, {
//         method: this.method,
//         headers: this.headers,
//         body: this._bodyText,
//       });
//     }
//   } as any;
// }

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

// Mock Next.js cookies
// vi.mock('next/headers', () => ({
//   cookies: () => ({
//     get: vi.fn().mockReturnValue(null),
//     getAll: vi.fn().mockReturnValue([]),
//     has: vi.fn().mockReturnValue(false),
//     set: vi.fn(),
//     delete: vi.fn(),
//   }),
// }));

// Mock Sentry
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock PostHog
vi.mock('@/lib/posthog', () => ({
  default: () => ({
    capture: vi.fn(),
    shutdown: vi.fn().mockResolvedValue(undefined),
  }),
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
vi.mock('@/lib/supabase/queries', () => ({
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
}));

// Mock audio conversion utility
vi.mock('@/lib/audio', () => ({
  convertToWav: vi.fn((data: string, mimeType: string) => {
    // Return a mock audio buffer
    return Buffer.from('mock-audio-data');
  }),
}));

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

// Mock Google Generative AI module
vi.mock('@google/genai', () => ({
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
          },
        ],
      }),
    },
  })),
}));

// Mock crypto.subtle for hash generation
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
