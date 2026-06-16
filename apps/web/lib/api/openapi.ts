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
    id: '390f5864-111b-4795-81ea-7026a1e64cfc',
    name: 'achernar',
    language: 'multiple',
    model: 'gpro',
    formats: ['wav'],
    supports_style: true,
  },
  {
    id: '5797178d-c047-44ea-aef4-94e97fb48663',
    name: 'aoede',
    language: 'multiple',
    model: 'gpro',
    formats: ['wav'],
    supports_style: true,
  },
  {
    id: 'cd71a399-9c9a-4384-b76e-14e96a45fc8a',
    name: 'autonoe',
    language: 'multiple',
    model: 'gpro',
    formats: ['wav'],
    supports_style: true,
  },
  {
    id: 'c38d0c52-e8c1-404b-9cb1-56d4cf252b9f',
    name: 'callirrhoe',
    language: 'multiple',
    model: 'gpro',
    formats: ['wav'],
    supports_style: true,
  },
  {
    id: 'f586bd2c-909f-4bf3-a859-4e45e45a22d6',
    name: 'despina',
    language: 'multiple',
    model: 'gpro',
    formats: ['wav'],
    supports_style: true,
  },
  {
    id: '530c8354-bb32-4231-a9c9-3c05fcdd220b',
    name: 'erinome',
    language: 'multiple',
    model: 'gpro',
    formats: ['wav'],
    supports_style: true,
  },
  {
    id: '3da76670-6fca-435b-b097-eed8cc6f37a5',
    name: 'gacrux',
    language: 'multiple',
    model: 'gpro',
    formats: ['wav'],
    supports_style: true,
  },
  {
    id: '5a2bffef-5e60-4fe6-b989-9ed3e68b6c48',
    name: 'kore',
    language: 'multiple',
    model: 'gpro',
    formats: ['wav'],
    supports_style: true,
  },
  {
    id: '0111e4dd-a38a-48e0-a8bb-a0a057f4cceb',
    name: 'puck',
    language: 'multiple',
    model: 'gpro',
    formats: ['wav'],
    supports_style: true,
  },
  {
    id: 'a68482ea-c14e-43cf-bf8c-16074bff9f8d',
    name: 'sulafat',
    language: 'multiple',
    model: 'gpro',
    formats: ['wav'],
    supports_style: true,
  },
  {
    id: '03925a20-4e15-4745-b86c-2c2e9d7de870',
    name: 'zephyr',
    language: 'multiple',
    model: 'gpro',
    formats: ['wav'],
    supports_style: true,
  },
  {
    id: '9d028af7-3c3e-466a-b53f-9a08dc66bf30',
    name: 'ara',
    language: 'multiple',
    model: 'xai',
    formats: ['mp3', 'wav'],
    supports_style: false,
  },
  {
    id: '9aff7755-72c9-4d90-bcf1-c06e18e769b6',
    name: 'eve',
    language: 'multiple',
    model: 'xai',
    formats: ['mp3', 'wav'],
    supports_style: false,
  },
  {
    id: 'fd965707-5367-4b89-a05a-c8cd086ba5ab',
    name: 'leo',
    language: 'multiple',
    model: 'xai',
    formats: ['mp3', 'wav'],
    supports_style: false,
  },
  {
    id: '1391aaf8-d3b5-41a5-8554-2c0c9b6d099d',
    name: 'rex',
    language: 'multiple',
    model: 'xai',
    formats: ['mp3', 'wav'],
    supports_style: false,
  },
  {
    id: '57085a6a-2396-445c-a6c1-fd0ce8368d72',
    name: 'sal',
    language: 'multiple',
    model: 'xai',
    formats: ['mp3', 'wav'],
    supports_style: false,
  },
  {
    id: '218f9750-e7bc-4ae5-9e1d-c6f9d4ffaa74',
    name: 'dan',
    language: 'en-GB 🇬🇧',
    model: 'orpheus',
    formats: ['mp3'],
    supports_style: false,
  },
  {
    id: '698e2e46-7c37-4ff4-ad15-558b30514dea',
    name: 'emma',
    language: 'en-US 🇺🇸',
    model: 'orpheus',
    formats: ['mp3'],
    supports_style: false,
  },
  {
    id: 'a5bd6e81-0d1e-490d-b669-bc383ee4ec7c',
    name: 'josh',
    language: 'en-US 🇺🇸',
    model: 'orpheus',
    formats: ['mp3'],
    supports_style: false,
  },
  {
    id: 'e55e4fc7-c140-46eb-82da-4d8c97f03d95',
    name: 'tara',
    language: 'en-US 🇺🇸',
    model: 'orpheus',
    formats: ['mp3'],
    supports_style: false,
  },
] as const;

export function createExternalApiOpenApiDocument() {
  return createDocument({
    openapi: '3.1.0',
    info: {
      title: 'SexyVoice API',
      version: '1.0.1',
      description: 'API for text-to-speech generation.',
    },
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'API Key',
        },
      },
      schemas: {
        VoiceGenerationRequest: VoiceGenerationRequestSchema,
        VoiceGenerationResponse: VoiceGenerationResponseSchema,
        ErrorResponse: ErrorResponseSchema,
        VoicesResponse: VoicesResponseSchema,
        ModelsResponse: ModelsResponseSchema,
        BillingResponse: BillingResponseSchema,
      },
    },
    paths: {
      '/api/v1/speech': {
        post: {
          security: [{ BearerAuth: [] }],
          summary: 'Generate speech audio',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: VoiceGenerationRequestSchema,
                examples: {
                  basic: {
                    summary: 'Basic voice generation',
                    value: {
                      model: 'gpro',
                      input: 'Hello, world!',
                      voice: 'achernar',
                    },
                  },
                  with_style: {
                    summary: 'Voice generation with emotion',
                    value: {
                      model: 'gpro',
                      input: 'This is amazing news!',
                      voice: 'zephyr',
                      style: 'happy',
                    },
                  },
                  orpheus_voice: {
                    summary: 'Orpheus model with English voice',
                    value: {
                      model: 'orpheus',
                      input: 'Hello, my name is Tara!',
                      voice: 'tara',
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Speech generated',
              content: {
                'application/json': {
                  schema: VoiceGenerationResponseSchema,
                },
              },
            },
            400: {
              description: 'Bad request',
              content: {
                'application/json': {
                  schema: ErrorResponseSchema,
                },
              },
            },
            401: {
              description: 'Authentication failed',
              content: {
                'application/json': {
                  schema: ErrorResponseSchema,
                },
              },
            },
            402: {
              description: 'Insufficient credits',
              content: {
                'application/json': {
                  schema: ErrorResponseSchema,
                },
              },
            },
            404: {
              description: 'Voice not found',
              content: {
                'application/json': {
                  schema: ErrorResponseSchema,
                },
              },
            },
            422: {
              description: 'Content policy violation',
              content: {
                'application/json': {
                  schema: ErrorResponseSchema,
                },
              },
            },
            429: {
              description: 'Rate limit exceeded',
              content: {
                'application/json': {
                  schema: ErrorResponseSchema,
                },
              },
            },
            500: {
              description: 'Server error',
              content: {
                'application/json': {
                  schema: ErrorResponseSchema,
                },
              },
            },
          },
        },
      },
      '/api/v1/voices': {
        get: {
          security: [{ BearerAuth: [] }],
          summary: 'List available voices',
          responses: {
            200: {
              description: 'Voices list',
              content: {
                'application/json': {
                  schema: VoicesResponseSchema,
                  examples: {
                    available_voices: {
                      summary: 'Currently available voices',
                      value: {
                        data: AVAILABLE_VOICES_EXAMPLE,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/v1/models': {
        get: {
          security: [{ BearerAuth: [] }],
          summary: 'List available models',
          responses: {
            200: {
              description: 'Models list',
              content: {
                'application/json': {
                  schema: ModelsResponseSchema,
                },
              },
            },
          },
        },
      },
      '/api/v1/billing': {
        get: {
          security: [{ BearerAuth: [] }],
          summary: 'Get billing balance',
          responses: {
            200: {
              description: 'Billing balance',
              content: {
                'application/json': {
                  schema: BillingResponseSchema,
                },
              },
            },
            401: {
              description: 'Authentication failed',
              content: {
                'application/json': {
                  schema: ErrorResponseSchema,
                },
              },
            },
            429: {
              description: 'Rate limit exceeded',
              content: {
                'application/json': {
                  schema: ErrorResponseSchema,
                },
              },
            },
            500: {
              description: 'Server error',
              content: {
                'application/json': {
                  schema: ErrorResponseSchema,
                },
              },
            },
          },
        },
      },
    },
  });
}
