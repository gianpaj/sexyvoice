import { createDocument } from 'zod-openapi';

import {
  BillingResponseSchema,
  ErrorResponseSchema,
  ModelsResponseSchema,
  VoiceGenerationRequestOpenApiSchema,
  VoiceGenerationResponseSchema,
  VoicesResponseSchema,
} from '@/lib/api/schemas';

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
        VoiceGenerationRequest: VoiceGenerationRequestOpenApiSchema,
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
                schema: VoiceGenerationRequestOpenApiSchema,
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
                  xai_voice: {
                    summary: 'xAI model with Grok voice tags',
                    value: {
                      model: 'xai',
                      input: 'Hello from Grok! [laugh]',
                      voice: 'eve',
                      response_format: 'wav',
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
                            name: 'kore',
                            language: 'multiple',
                            model: 'gpro',
                            formats: ['wav'],
                            supports_style: true,
                          },
                          {
                            id: '5797178d-c047-44ea-aef4-94e97fb48663',
                            name: 'tara',
                            language: 'en',
                            model: 'orpheus',
                            formats: ['mp3'],
                            supports_style: false,
                          },
                          {
                            id: '530c8354-bb32-4231-a9c9-3c05fcdd220b',
                            name: 'eve',
                            language: 'en',
                            model: 'xai',
                            formats: ['mp3', 'wav'],
                            supports_style: false,
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
