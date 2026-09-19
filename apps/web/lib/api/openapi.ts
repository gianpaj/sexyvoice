import { createDocument } from 'zod-openapi';

import {
  BillingResponseSchema,
  ErrorResponseSchema,
  ModelsResponseSchema,
  VoiceGenerationRequestSchema,
  VoiceGenerationResponseSchema,
  VoicesResponseSchema,
} from '@/lib/api/schemas';

const AVAILABLE_VOICES_EXAMPLE = [
  {
    formats: ['wav'],
    id: '390f5864-111b-4795-81ea-7026a1e64cfc',
    language: 'multiple',
    model: 'gpro',
    name: 'achernar',
    supports_style: true,
  },
  {
    formats: ['wav'],
    id: '5797178d-c047-44ea-aef4-94e97fb48663',
    language: 'multiple',
    model: 'gpro',
    name: 'aoede',
    supports_style: true,
  },
  {
    formats: ['wav'],
    id: 'cd71a399-9c9a-4384-b76e-14e96a45fc8a',
    language: 'multiple',
    model: 'gpro',
    name: 'autonoe',
    supports_style: true,
  },
  {
    formats: ['wav'],
    id: 'c38d0c52-e8c1-404b-9cb1-56d4cf252b9f',
    language: 'multiple',
    model: 'gpro',
    name: 'callirrhoe',
    supports_style: true,
  },
  {
    formats: ['wav'],
    id: 'f586bd2c-909f-4bf3-a859-4e45e45a22d6',
    language: 'multiple',
    model: 'gpro',
    name: 'despina',
    supports_style: true,
  },
  {
    formats: ['wav'],
    id: '530c8354-bb32-4231-a9c9-3c05fcdd220b',
    language: 'multiple',
    model: 'gpro',
    name: 'erinome',
    supports_style: true,
  },
  {
    formats: ['wav'],
    id: '3da76670-6fca-435b-b097-eed8cc6f37a5',
    language: 'multiple',
    model: 'gpro',
    name: 'gacrux',
    supports_style: true,
  },
  {
    formats: ['wav'],
    id: '5a2bffef-5e60-4fe6-b989-9ed3e68b6c48',
    language: 'multiple',
    model: 'gpro',
    name: 'kore',
    supports_style: true,
  },
  {
    formats: ['wav'],
    id: '0111e4dd-a38a-48e0-a8bb-a0a057f4cceb',
    language: 'multiple',
    model: 'gpro',
    name: 'puck',
    supports_style: true,
  },
  {
    formats: ['wav'],
    id: 'a68482ea-c14e-43cf-bf8c-16074bff9f8d',
    language: 'multiple',
    model: 'gpro',
    name: 'sulafat',
    supports_style: true,
  },
  {
    formats: ['wav'],
    id: '03925a20-4e15-4745-b86c-2c2e9d7de870',
    language: 'multiple',
    model: 'gpro',
    name: 'zephyr',
    supports_style: true,
  },
  {
    formats: ['mp3', 'wav'],
    id: '9d028af7-3c3e-466a-b53f-9a08dc66bf30',
    language: 'multiple',
    model: 'xai',
    name: 'ara',
    supports_style: false,
  },
  {
    formats: ['mp3', 'wav'],
    id: '9aff7755-72c9-4d90-bcf1-c06e18e769b6',
    language: 'multiple',
    model: 'xai',
    name: 'eve',
    supports_style: false,
  },
  {
    formats: ['mp3', 'wav'],
    id: 'fd965707-5367-4b89-a05a-c8cd086ba5ab',
    language: 'multiple',
    model: 'xai',
    name: 'leo',
    supports_style: false,
  },
  {
    formats: ['mp3', 'wav'],
    id: '1391aaf8-d3b5-41a5-8554-2c0c9b6d099d',
    language: 'multiple',
    model: 'xai',
    name: 'rex',
    supports_style: false,
  },
  {
    formats: ['mp3', 'wav'],
    id: '57085a6a-2396-445c-a6c1-fd0ce8368d72',
    language: 'multiple',
    model: 'xai',
    name: 'sal',
    supports_style: false,
  },
  {
    formats: ['mp3'],
    id: '218f9750-e7bc-4ae5-9e1d-c6f9d4ffaa74',
    language: 'en-GB 🇬🇧',
    model: 'orpheus',
    name: 'dan',
    supports_style: false,
  },
  {
    formats: ['mp3'],
    id: '698e2e46-7c37-4ff4-ad15-558b30514dea',
    language: 'en-US 🇺🇸',
    model: 'orpheus',
    name: 'emma',
    supports_style: false,
  },
  {
    formats: ['mp3'],
    id: 'a5bd6e81-0d1e-490d-b669-bc383ee4ec7c',
    language: 'en-US 🇺🇸',
    model: 'orpheus',
    name: 'josh',
    supports_style: false,
  },
  {
    formats: ['mp3'],
    id: 'e55e4fc7-c140-46eb-82da-4d8c97f03d95',
    language: 'en-US 🇺🇸',
    model: 'orpheus',
    name: 'tara',
    supports_style: false,
  },
] as const;

export function createExternalApiOpenApiDocument() {
  return createDocument({
    components: {
      schemas: {
        BillingResponse: BillingResponseSchema,
        ErrorResponse: ErrorResponseSchema,
        ModelsResponse: ModelsResponseSchema,
        VoiceGenerationRequest: VoiceGenerationRequestSchema,
        VoiceGenerationResponse: VoiceGenerationResponseSchema,
        VoicesResponse: VoicesResponseSchema,
      },
      securitySchemes: {
        BearerAuth: {
          bearerFormat: 'API Key',
          scheme: 'bearer',
          type: 'http',
        },
      },
    },
    info: {
      description: 'API for text-to-speech generation.',
      title: 'SexyVoice API',
      version: '1.0.1',
    },
    openapi: '3.1.0',
    paths: {
      '/api/v1/billing': {
        get: {
          responses: {
            200: {
              content: {
                'application/json': {
                  schema: BillingResponseSchema,
                },
              },
              description: 'Billing balance',
            },
            401: {
              content: {
                'application/json': {
                  schema: ErrorResponseSchema,
                },
              },
              description: 'Authentication failed',
            },
            429: {
              content: {
                'application/json': {
                  schema: ErrorResponseSchema,
                },
              },
              description: 'Rate limit exceeded',
            },
            500: {
              content: {
                'application/json': {
                  schema: ErrorResponseSchema,
                },
              },
              description: 'Server error',
            },
          },
          security: [{ BearerAuth: [] }],
          summary: 'Get billing balance',
        },
      },
      '/api/v1/models': {
        get: {
          responses: {
            200: {
              content: {
                'application/json': {
                  schema: ModelsResponseSchema,
                },
              },
              description: 'Models list',
            },
          },
          security: [{ BearerAuth: [] }],
          summary: 'List available models',
        },
      },
      '/api/v1/speech': {
        post: {
          requestBody: {
            content: {
              'application/json': {
                examples: {
                  basic: {
                    summary: 'Basic voice generation',
                    value: {
                      input: 'Hello, world!',
                      model: 'gpro',
                      voice: 'achernar',
                    },
                  },
                  by_voice_id: {
                    summary: 'Generate with a voice ID from /api/v1/voices',
                    value: {
                      input: 'Hello, world!',
                      voiceId: '390f5864-111b-4795-81ea-7026a1e64cfc',
                    },
                  },
                  gemini_with_temperature: {
                    summary: 'Gemini voice with sampling temperature',
                    value: {
                      input: 'Hello from SexyVoice API',
                      model: 'gpro',
                      temperature: 1.2,
                      voice: 'achernar',
                    },
                  },
                  grok_with_speed: {
                    summary: 'Grok voice with speech speed',
                    value: {
                      input: 'Hello from Grok!',
                      model: 'xai',
                      speed: 1.2,
                      voice: 'eve',
                    },
                  },
                  orpheus_voice: {
                    summary: 'Orpheus model with English voice',
                    value: {
                      input: 'Hello, my name is Tara!',
                      model: 'orpheus',
                      voice: 'tara',
                    },
                  },
                  with_style: {
                    summary: 'Voice generation with emotion',
                    value: {
                      input: 'This is amazing news!',
                      model: 'gpro',
                      style: 'happy',
                      voice: 'zephyr',
                    },
                  },
                },
                schema: VoiceGenerationRequestSchema,
              },
            },
            required: true,
          },
          responses: {
            200: {
              content: {
                'application/json': {
                  schema: VoiceGenerationResponseSchema,
                },
              },
              description: 'Speech generated',
            },
            400: {
              content: {
                'application/json': {
                  schema: ErrorResponseSchema,
                },
              },
              description: 'Bad request',
            },
            401: {
              content: {
                'application/json': {
                  schema: ErrorResponseSchema,
                },
              },
              description: 'Authentication failed',
            },
            402: {
              content: {
                'application/json': {
                  schema: ErrorResponseSchema,
                },
              },
              description: 'Insufficient credits',
            },
            404: {
              content: {
                'application/json': {
                  schema: ErrorResponseSchema,
                },
              },
              description: 'Voice not found',
            },
            422: {
              content: {
                'application/json': {
                  schema: ErrorResponseSchema,
                },
              },
              description: 'Content policy violation',
            },
            429: {
              content: {
                'application/json': {
                  schema: ErrorResponseSchema,
                },
              },
              description: 'Rate limit exceeded',
            },
            500: {
              content: {
                'application/json': {
                  schema: ErrorResponseSchema,
                },
              },
              description: 'Server error',
            },
            503: {
              content: {
                'application/json': {
                  schema: ErrorResponseSchema,
                },
              },
              description: 'Upstream service temporarily unavailable',
            },
          },
          security: [{ BearerAuth: [] }],
          summary: 'Generate speech audio',
        },
      },
      '/api/v1/voices': {
        get: {
          responses: {
            200: {
              content: {
                'application/json': {
                  examples: {
                    available_voices: {
                      summary: 'Currently available voices',
                      value: {
                        data: AVAILABLE_VOICES_EXAMPLE,
                      },
                    },
                  },
                  schema: VoicesResponseSchema,
                },
              },
              description: 'Voices list',
            },
          },
          security: [{ BearerAuth: [] }],
          summary: 'List available voices',
        },
      },
    },
  });
}
