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
                      voice: 'poe',
                    },
                  },
                  with_style: {
                    summary: 'Voice generation with emotion',
                    value: {
                      model: 'gpro',
                      input: 'This is amazing news!',
                      voice: 'tara',
                      style: 'happy',
                    },
                  },
                  minimal: {
                    summary: 'Minimum required parameters',
                    value: {
                      model: 'kokoro',
                      input: 'Test',
                      voice: 'pietro',
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
