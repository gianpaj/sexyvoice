import { createDocument } from 'zod-openapi';

import {
  BillingResponseSchema,
  ErrorResponseSchema,
  ModelsResponseSchema,
  VoiceGenerationRequestSchema,
  VoiceGenerationResponseSchema,
  VoicesResponseSchema,
} from '@/lib/api/schemas';

export function createExternalApiOpenApiDocument() {
  return createDocument({
    openapi: '3.1.0',
    info: {
      title: 'SexyVoice External API',
      version: '1.0.0',
      description: 'External API for text-to-speech generation.',
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
                      summary: 'Currently available gpro voices',
                      value: {
                        data: [
                          {
                            id: '390f5864-111b-4795-81ea-7026a1e64cfc',
                            name: 'achernar',
                            language: 'multiple',
                            model: 'gpro',
                            formats: ['wav'],
                            styles: [],
                          },
                          {
                            id: '03925a20-4e15-4745-b86c-2c2e9d7de870',
                            name: 'zephyr',
                            language: 'multiple',
                            model: 'gpro',
                            formats: ['wav'],
                            styles: [],
                          },
                          {
                            id: '5797178d-c047-44ea-aef4-94e97fb48663',
                            name: 'aoede',
                            language: 'multiple',
                            model: 'gpro',
                            formats: ['wav'],
                            styles: [],
                          },
                          {
                            id: 'cd71a399-9c9a-4384-b76e-14e96a45fc8a',
                            name: 'autonoe',
                            language: 'multiple',
                            model: 'gpro',
                            formats: ['wav'],
                            styles: [],
                          },
                          {
                            id: 'c38d0c52-e8c1-404b-9cb1-56d4cf252b9f',
                            name: 'callirrhoe',
                            language: 'multiple',
                            model: 'gpro',
                            formats: ['wav'],
                            styles: [],
                          },
                          {
                            id: '3da76670-6fca-435b-b097-eed8cc6f37a5',
                            name: 'gacrux',
                            language: 'multiple',
                            model: 'gpro',
                            formats: ['wav'],
                            styles: [],
                          },
                          {
                            id: 'f586bd2c-909f-4bf3-a859-4e45e45a22d6',
                            name: 'despina',
                            language: 'multiple',
                            model: 'gpro',
                            formats: ['wav'],
                            styles: [],
                          },
                          {
                            id: '530c8354-bb32-4231-a9c9-3c05fcdd220b',
                            name: 'erinome',
                            language: 'multiple',
                            model: 'gpro',
                            formats: ['wav'],
                            styles: [],
                          },
                          {
                            id: '0111e4dd-a38a-48e0-a8bb-a0a057f4cceb',
                            name: 'puck',
                            language: 'multiple',
                            model: 'gpro',
                            formats: ['wav'],
                            styles: [],
                          },
                          {
                            id: 'a68482ea-c14e-43cf-bf8c-16074bff9f8d',
                            name: 'sulafat',
                            language: 'multiple',
                            model: 'gpro',
                            formats: ['wav'],
                            styles: [],
                          },
                          {
                            id: '5a2bffef-5e60-4fe6-b989-9ed3e68b6c48',
                            name: 'kore',
                            language: 'multiple',
                            model: 'gpro',
                            formats: ['wav'],
                            styles: [],
                          },
                        ],
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
