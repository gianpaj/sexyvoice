import { beforeAll, afterAll, afterEach } from 'vitest'
import { setupServer } from 'msw/node'
import { HttpResponse, http } from 'msw'

// Mock handlers for external services
export const handlers = [
  // Supabase Auth Mock
  http.get('https://*.supabase.co/auth/v1/user', () => {
    return HttpResponse.json({
      user: {
        id: 'test-user-id',
        email: 'test@example.com',
        app_metadata: {},
        user_metadata: {},
      }
    })
  }),

  // Supabase Database Mocks
  http.get('https://*.supabase.co/rest/v1/credits', ({ request }) => {
    const url = new URL(request.url)
    if (url.searchParams.get('user_id')) {
      return HttpResponse.json([{ amount: 1000 }])
    }
    return HttpResponse.json([])
  }),

  http.get('https://*.supabase.co/rest/v1/voices', ({ request }) => {
    const url = new URL(request.url)
    const voice = url.searchParams.get('name')?.replace('eq.', '')
    
    if (voice === 'tara') {
      return HttpResponse.json([{
        id: 'voice-tara-id',
        name: 'tara',
        language: 'en',
        model: 'lucataco/xtts-v2:684bc3855b37866c0c65add2ff39c78f3dea3f4ff103a436465326e0f438d55e'
      }])
    }
    
    if (voice === 'poe') {
      return HttpResponse.json([{
        id: 'voice-poe-id', 
        name: 'poe',
        language: 'en',
        model: 'gpro'
      }])
    }
    
    return HttpResponse.json([])
  }),

  http.patch('https://*.supabase.co/rest/v1/credits', () => {
    return HttpResponse.json({ success: true })
  }),

  http.post('https://*.supabase.co/rest/v1/audio_files', () => {
    return HttpResponse.json({ 
      id: 'test-audio-file-id',
      success: true 
    })
  }),

  http.post('https://*.supabase.co/rest/v1/rpc/increment_user_credits', () => {
    return HttpResponse.json({ success: true })
  }),

  // Replicate API Mock
  http.post('https://api.replicate.com/v1/predictions', () => {
    return HttpResponse.json({
      id: 'test-prediction-id',
      status: 'succeeded',
      output: 'https://example.com/audio.mp3'
    })
  }),

  // Google Generative AI Mock
  http.post('https://generativelanguage.googleapis.com/v1beta/models/*:generateContent', () => {
    // Mock audio data (base64 encoded dummy audio)
    const mockAudioData = 'UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA='
    
    return HttpResponse.json({
      candidates: [{
        content: {
          parts: [{
            inlineData: {
              data: mockAudioData,
              mimeType: 'audio/wav'
            }
          }]
        }
      }]
    })
  }),

  // Upstash Redis Mock
  http.get('https://*.upstash.io/*', ({ request }) => {
    const url = new URL(request.url)
    if (url.pathname.includes('/get/')) {
      // Return null for cache miss
      return HttpResponse.json({ result: null })
    }
    return HttpResponse.json({ result: 'OK' })
  }),

  http.post('https://*.upstash.io/*', ({ request }) => {
    const url = new URL(request.url) 
    if (url.pathname.includes('/set/')) {
      return HttpResponse.json({ result: 'OK' })
    }
    return HttpResponse.json({ result: 'OK' })
  }),

  // Vercel Blob Storage Mock
  http.put('https://blob.vercel-storage.com/*', () => {
    return HttpResponse.json({
      url: 'https://blob.vercel-storage.com/test-audio-xyz.wav',
      downloadUrl: 'https://blob.vercel-storage.com/test-audio-xyz.wav',
      pathname: 'test-audio-xyz.wav'
    })
  }),

  // PostHog Mock
  http.post('https://us.i.posthog.com/capture/', () => {
    return HttpResponse.json({ success: true })
  }),
]

// Setup MSW server
export const server = setupServer(...handlers)

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' })
})

afterEach(() => {
  server.resetHandlers()
})

afterAll(() => {
  server.close()
})

// Mock environment variables
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'test-gemini-key'
process.env.REPLICATE_API_TOKEN = 'test-replicate-token'
process.env.KV_REST_API_URL = 'https://test.upstash.io'
process.env.KV_REST_API_TOKEN = 'test-redis-token'
process.env.BLOB_READ_WRITE_TOKEN = 'test-blob-token'

// Mock Next.js modules that aren't available in test environment
vi.mock('next/server', () => ({
  NextResponse: {
    json: (data: any, init?: any) => {
      const response = new Response(JSON.stringify(data), {
        ...init,
        headers: {
          'content-type': 'application/json',
          ...(init?.headers || {})
        }
      })
      return response
    }
  },
  after: (fn: () => Promise<void>) => {
    // In tests, execute immediately instead of after response
    return fn()
  }
}))

// Mock Sentry
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  logger: {
    info: vi.fn(),
    warn: vi.fn(), 
    error: vi.fn()
  }
}))

// Mock PostHog
vi.mock('@/lib/posthog', () => ({
  default: () => ({
    capture: vi.fn(),
    shutdown: vi.fn().mockResolvedValue(undefined)
  })
}))

// Mock audio conversion utility
vi.mock('@/lib/audio', () => ({
  convertToWav: vi.fn((data: string, mimeType: string) => {
    // Return a mock audio buffer
    return Buffer.from('mock-audio-data')
  })
}))

// Mock crypto.subtle for hash generation
Object.defineProperty(global, 'crypto', {
  value: {
    subtle: {
      digest: vi.fn().mockResolvedValue(
        new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])
      )
    }
  }
})

// Mock ReadableStream for Replicate output
global.ReadableStream = class ReadableStream {
  constructor() {}
} as any