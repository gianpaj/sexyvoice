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
    id: '1236ed64-eedc-4608-91b8-d545966b3777',
    language: 'multiple',
    model: 'gpro38',
    name: 'achernar',
    supports_style: true,
  },
  {
    formats: ['wav'],
    id: '78184293-4058-4a6a-8832-c41edb341fd7',
    language: 'multiple',
    model: 'gpro38',
    name: 'aoede',
    supports_style: true,
  },
  {
    formats: ['wav'],
    id: '05eb6904-b8c8-46cd-b86e-96574ec04808',
    language: 'multiple',
    model: 'gpro38',
    name: 'autonoe',
    supports_style: true,
  },
  {
    formats: ['wav'],
    id: '28a915dd-afa1-4e1c-bd26-663594cbccf5',
    language: 'multiple',
    model: 'gpro38',
    name: 'callirrhoe',
    supports_style: true,
  },
  {
    formats: ['wav'],
    id: 'ed34a03e-f216-4ee6-8a6f-f1e848f29d42',
    language: 'multiple',
    model: 'gpro38',
    name: 'despina',
    supports_style: true,
  },
  {
    formats: ['wav'],
    id: '4ae82b29-33e0-46dd-befa-51b2a98b9e48',
    language: 'multiple',
    model: 'gpro38',
    name: 'erinome',
    supports_style: true,
  },
  {
    formats: ['wav'],
    id: 'd19ebe92-eb22-4e9c-ae91-64d66c413140',
    language: 'multiple',
    model: 'gpro38',
    name: 'gacrux',
    supports_style: true,
  },
  {
    formats: ['wav'],
    id: '0ebbd66c-8103-442d-a65e-055fdf086be8',
    language: 'multiple',
    model: 'gpro38',
    name: 'kore',
    supports_style: true,
  },
  {
    formats: ['wav'],
    id: '005b84ec-6fa6-43a0-a3b6-d5f750efeaaa',
    language: 'multiple',
    model: 'gpro38',
    name: 'puck',
    supports_style: true,
  },
  {
    formats: ['wav'],
    id: 'e9d93551-ed76-4cdc-9438-d7a614270b18',
    language: 'multiple',
    model: 'gpro38',
    name: 'sulafat',
    supports_style: true,
  },
  {
    formats: ['wav'],
    id: '1269262d-e652-4a8d-b9c9-11dade5a30fb',
    language: 'multiple',
    model: 'gpro38',
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
      version: '1.1.0',
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
                      model: 'gpro38',
                      voice: 'achernar',
                    },
                  },
                  by_voice_id: {
                    summary: 'Generate with a voice ID from /api/v1/voices',
                    value: {
                      input: 'Hello, world!',
                      voiceId: '1236ed64-eedc-4608-91b8-d545966b3777',
                    },
                  },
                  gemini_with_temperature: {
                    summary: 'Gemini voice with sampling temperature',
                    value: {
                      input: 'Hello from SexyVoice API',
                      model: 'gpro38',
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
                      model: 'gpro38',
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
              description:
                'Voice ID not found, or voice name not found for the requested model',
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
