/**
 * OpenAPI 3.0 specification for SexyVoice.ai External API
 * This specification is automatically generated based on the actual API implementation
 */

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'SexyVoice.ai External API',
    description: `
# SexyVoice.ai External API

The SexyVoice.ai External API provides programmatic access to our AI voice generation platform. Generate high-quality AI voices using the same technology that powers our dashboard.

## Authentication

All API requests require authentication using an API key. Include your API key in the Authorization header:

\`\`\`
Authorization: Bearer YOUR_API_KEY
\`\`\`

You can generate API keys from your [profile page](https://sexyvoice.ai/dashboard/profile).

## Rate Limits

API requests are subject to rate limits based on your account tier. Exceeded limits will return a 429 status code.

## Credits

Voice generation consumes credits from your account balance. Each request will deduct credits based on text length and voice model used.
    `.trim(),
    version: '1.0.0',
    contact: {
      name: 'SexyVoice.ai Support',
      url: 'https://sexyvoice.ai',
      email: 'support@sexyvoice.ai',
    },
    license: {
      name: 'Proprietary',
      url: 'https://sexyvoice.ai/terms',
    },
  },
  servers: [
    {
      url: 'https://sexyvoice.ai',
      description: 'Production server',
    },
  ],
  paths: {
    '/v1/api/audio/speech': {
      post: {
        summary: 'Generate speech from text',
        description: `
Generates high-quality AI speech from input text using the specified voice model. 

This endpoint is compatible with OpenAI's text-to-speech API format, making it easy to integrate with existing tools and libraries.

### Supported Voices

Available voices include various personalities and languages. Use the dashboard to explore available voices and their characteristics.

### Response Format

The API returns a JSON response containing the URL to the generated audio file, along with credit usage information.
        `.trim(),
        operationId: 'createSpeech',
        tags: ['Audio'],
        security: [
          {
            BearerAuth: [],
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['input', 'voice'],
                properties: {
                  model: {
                    type: 'string',
                    description: 'The TTS model to use. Currently supported: tts-1',
                    default: 'tts-1',
                    enum: ['tts-1'],
                  },
                  input: {
                    type: 'string',
                    description: 'The text to synthesize into speech',
                    example: 'Hello, welcome to SexyVoice.ai! This is a demonstration of our AI voice technology.',
                    maxLength: 4000,
                  },
                  voice: {
                    type: 'string',
                    description: 'The voice to use for synthesis. Available voices can be found in your dashboard.',
                    example: 'alloy',
                  },
                  response_format: {
                    type: 'string',
                    description: 'The audio format of the output',
                    default: 'mp3',
                    enum: ['mp3', 'wav'],
                  },
                  speed: {
                    type: 'number',
                    description: 'The speed of speech (currently not implemented, reserved for future use)',
                    default: 1.0,
                    minimum: 0.25,
                    maximum: 4.0,
                  },
                },
              },
              examples: {
                basicRequest: {
                  summary: 'Basic speech synthesis',
                  value: {
                    model: 'tts-1',
                    input: 'Hello, this is a test of the SexyVoice.ai API!',
                    voice: 'alloy',
                    response_format: 'mp3',
                  },
                },
                longText: {
                  summary: 'Longer text synthesis',
                  value: {
                    model: 'tts-1',
                    input: 'Welcome to SexyVoice.ai, the leading platform for AI voice generation. Our advanced technology allows you to create professional-quality voiceovers, podcasts, and audio content with ease.',
                    voice: 'nova',
                    response_format: 'wav',
                    speed: 1.0,
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Speech generation successful',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    url: {
                      type: 'string',
                      format: 'uri',
                      description: 'URL to the generated audio file',
                      example: 'https://blob.vercel-storage.com/audio/voice-abc123.wav',
                    },
                    credits_used: {
                      type: 'number',
                      description: 'Number of credits consumed for this request',
                      example: 10,
                    },
                    credits_remaining: {
                      type: 'number',
                      description: 'Remaining credits in your account after this request',
                      example: 990,
                    },
                    format: {
                      type: 'string',
                      description: 'The audio format of the generated file',
                      example: 'mp3',
                    },
                    model: {
                      type: 'string',
                      description: 'The model used for generation',
                      example: 'tts-1',
                    },
                  },
                  required: ['url', 'credits_used', 'credits_remaining'],
                },
                examples: {
                  successResponse: {
                    summary: 'Successful generation',
                    value: {
                      url: 'https://blob.vercel-storage.com/audio/voice-abc123.wav',
                      credits_used: 10,
                      credits_remaining: 990,
                      format: 'mp3',
                      model: 'tts-1',
                    },
                  },
                },
              },
            },
          },
          '400': {
            description: 'Invalid request parameters',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Error',
                },
                examples: {
                  missingInput: {
                    summary: 'Missing required input parameter',
                    value: {
                      error: {
                        type: 'invalid_request_error',
                        message: 'Missing required parameter: input',
                        param: 'input',
                        code: null,
                      },
                    },
                  },
                  missingVoice: {
                    summary: 'Missing required voice parameter',
                    value: {
                      error: {
                        type: 'invalid_request_error',
                        message: 'Missing required parameter: voice',
                        param: 'voice',
                        code: null,
                      },
                    },
                  },
                  invalidFormat: {
                    summary: 'Invalid response format',
                    value: {
                      error: {
                        type: 'invalid_request_error',
                        message: 'Invalid response_format. Supported formats: mp3, wav',
                        param: 'response_format',
                        code: null,
                      },
                    },
                  },
                  textTooLong: {
                    summary: 'Text exceeds maximum length',
                    value: {
                      error: {
                        type: 'invalid_request_error',
                        message: 'Text exceeds the maximum length of 4000 characters',
                        param: 'input',
                        code: null,
                      },
                    },
                  },
                },
              },
            },
          },
          '401': {
            description: 'Authentication failed',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Error',
                },
                examples: {
                  missingAuth: {
                    summary: 'Missing authorization header',
                    value: {
                      error: 'Missing or invalid authorization header',
                    },
                  },
                  invalidKey: {
                    summary: 'Invalid API key',
                    value: {
                      error: 'Invalid API key',
                    },
                  },
                },
              },
            },
          },
          '402': {
            description: 'Insufficient credits',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Error',
                },
                examples: {
                  insufficientCredits: {
                    summary: 'Not enough credits',
                    value: {
                      error: {
                        type: 'insufficient_quota',
                        message: 'Insufficient credits',
                        code: null,
                      },
                    },
                  },
                },
              },
            },
          },
          '403': {
            description: 'Access forbidden',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Error',
                },
                examples: {
                  freemiumLimit: {
                    summary: 'Freemium user limit exceeded',
                    value: {
                      error: {
                        type: 'api_error',
                        message: 'You have exceeded the limit of 4 multilingual voice generations as a free user. Please try a different voice or upgrade your plan for unlimited access.',
                        code: 'gproLimitExceeded',
                      },
                    },
                  },
                },
              },
            },
          },
          '404': {
            description: 'Voice not found',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Error',
                },
                examples: {
                  voiceNotFound: {
                    summary: 'Invalid voice parameter',
                    value: {
                      error: {
                        type: 'invalid_request_error',
                        message: 'Invalid voice parameter',
                        code: null,
                      },
                    },
                  },
                },
              },
            },
          },
          '429': {
            description: 'Rate limit exceeded',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Error',
                },
                examples: {
                  rateLimited: {
                    summary: 'Too many requests',
                    value: {
                      error: {
                        type: 'rate_limit_exceeded',
                        message: 'Third-party API Quota exceeded',
                        code: null,
                      },
                    },
                  },
                },
              },
            },
          },
          '500': {
            description: 'Internal server error',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Error',
                },
                examples: {
                  serverError: {
                    summary: 'Internal server error',
                    value: {
                      error: {
                        type: 'api_error',
                        message: 'Internal server error',
                        code: null,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'API_KEY',
        description: 'API key authentication. Generate keys from your profile page.',
      },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          error: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                description: 'Error type classification',
                enum: [
                  'api_error',
                  'invalid_request_error',
                  'rate_limit_exceeded',
                  'insufficient_quota',
                ],
              },
              message: {
                type: 'string',
                description: 'Human-readable error message',
              },
              param: {
                type: 'string',
                nullable: true,
                description: 'The parameter that caused the error (if applicable)',
              },
              code: {
                type: 'string',
                nullable: true,
                description: 'Error code for programmatic handling',
              },
            },
            required: ['type', 'message'],
          },
        },
        required: ['error'],
      },
    },
  },
  tags: [
    {
      name: 'Audio',
      description: 'Audio generation and speech synthesis endpoints',
    },
  ],
} as const;

export type OpenApiSpec = typeof openApiSpec;