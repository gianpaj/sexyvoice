export const ERROR_CODES = {
  PROHIBITED_CONTENT: 'PROHIBITED_CONTENT',
  NO_DATA_OR_MIME_TYPE: 'NO_DATA_OR_MIME_TYPE',
  REPLICATE_ERROR: 'REPLICATE_ERROR',
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
} as const;

export const getErrorMessage = (
  errorCode: string | unknown,
  service: string,
) => {
  const errorMessages: { [key: string]: { [key: string]: string } } = {
    // INVALID_API_KEY: {
    //   default: 'The provided API key is invalid.',
    //   'voice-generation': 'The voice generation API key is invalid.',
    // },
    THIRD_P_QUOTA_EXCEEDED: {
      default:
        'We have exceeded our third-party API current quota, please try later or tomorrow',
    },
    // UNAUTHORIZED: {
    //   default: 'You are not authorized to perform this action.',
    //   'voice-generation': 'You are not authorized to generate voice content.',
    // },
    // NOT_FOUND: {
    //   default: 'The requested resource was not found.',
    //   'voice-generation': 'The requested voice resource was not found.',
    // },
    PROHIBITED_CONTENT: {
      default:
        'Content generation prohibited. Please modify your text input and try again',
    },
    NO_DATA_OR_MIME_TYPE: {
      default: 'Voice generation failed, please retry',
    },
    REPLICATE_ERROR: {
      default: 'Voice generation failed, please retry',
    },
    INTERNAL_SERVER_ERROR: {
      default: 'An internal server error occurred. Please try again later.',
    },
  };

  const serviceMessages = errorMessages[String(errorCode)];
  if (!serviceMessages) {
    return 'An unknown error occurred.';
  }

  return serviceMessages[service] || serviceMessages['default'];
};
