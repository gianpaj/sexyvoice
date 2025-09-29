# SexyVoice.ai External API Documentation

The SexyVoice.ai External API provides programmatic access to our AI voice generation platform. Generate high-quality AI voices using the same technology that powers our dashboard.

## Base URL

```
https://sexyvoice.ai
```

## Authentication

All API requests require authentication using an API key. Include your API key in the Authorization header:

```
Authorization: Bearer YOUR_API_KEY
```

You can generate API keys from your [profile page](https://sexyvoice.ai/dashboard/profile/api-keys).

## Rate Limits

API requests are subject to rate limits based on your account tier. Exceeded limits will return a 429 status code.

## Credits

Voice generation consumes credits from your account balance. Each request will deduct credits based on text length and voice model used. The API response includes your remaining credit balance.

## Endpoints

### Generate Speech

`POST /v1/api/audio/speech`

Generates high-quality AI speech from input text using the specified voice model.

#### Request Body

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `model` | string | No | The TTS model to use. Currently supported: `tts-1` (default) |
| `input` | string | Yes | The text to synthesize into speech (max 4000 characters) |
| `voice` | string | Yes | The voice to use for synthesis |
| `response_format` | string | No | The audio format: `mp3` (default) or `wav` |
| `speed` | number | No | Reserved for future use (default: 1.0) |

#### Available Voices

Use the dashboard to explore available voices and their characteristics. Common voices include:
- `alloy` - Neutral, balanced voice
- `echo` - Clear, professional tone
- `nova` - Warm, friendly voice
- `shimmer` - Bright, energetic voice

#### Response

```json
{
  "url": "https://blob.vercel-storage.com/audio/voice-abc123.wav",
  "credits_used": 10,
  "credits_remaining": 990,
  "format": "mp3",
  "model": "tts-1"
}
```

#### Error Responses

| Status Code | Error Type | Description |
|-------------|------------|-------------|
| 400 | `invalid_request_error` | Invalid request parameters |
| 401 | N/A | Authentication failed |
| 402 | `insufficient_quota` | Insufficient credits |
| 403 | `api_error` | Access forbidden (e.g., freemium limits) |
| 404 | `invalid_request_error` | Voice not found |
| 429 | `rate_limit_exceeded` | Rate limit exceeded |
| 500 | `api_error` | Internal server error |

## Code Examples

### TypeScript/JavaScript

```typescript
interface SpeechRequest {
  model?: 'tts-1';
  input: string;
  voice: string;
  response_format?: 'mp3' | 'wav';
  speed?: number;
}

interface SpeechResponse {
  url: string;
  credits_used: number;
  credits_remaining: number;
  format: string;
  model: string;
}

async function generateSpeech(apiKey: string, request: SpeechRequest): Promise<SpeechResponse> {
  const response = await fetch('https://sexyvoice.ai/v1/api/audio/speech', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`API Error: ${error.error?.message || 'Unknown error'}`);
  }

  return response.json();
}

// Usage example
const apiKey = 'sk-your-api-key-here';

generateSpeech(apiKey, {
  input: 'Hello, welcome to SexyVoice.ai! This is a demonstration of our AI voice technology.',
  voice: 'alloy',
  response_format: 'mp3'
}).then(result => {
  console.log('Audio generated:', result.url);
  console.log('Credits remaining:', result.credits_remaining);
}).catch(error => {
  console.error('Error:', error.message);
});
```

### Python

```python
import requests
import json
from typing import Dict, Optional

class SexyVoiceAPI:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://sexyvoice.ai"
        
    def generate_speech(
        self,
        input_text: str,
        voice: str,
        model: str = "tts-1",
        response_format: str = "mp3",
        speed: float = 1.0
    ) -> Dict:
        """
        Generate speech from text using SexyVoice.ai API
        
        Args:
            input_text: Text to convert to speech (max 4000 characters)
            voice: Voice to use for synthesis
            model: TTS model to use (default: "tts-1")
            response_format: Audio format - "mp3" or "wav" (default: "mp3")
            speed: Speech speed (reserved for future use, default: 1.0)
            
        Returns:
            Dictionary containing audio URL and credit information
        """
        headers = {
            'Authorization': f'Bearer {self.api_key}',
            'Content-Type': 'application/json'
        }
        
        data = {
            'model': model,
            'input': input_text,
            'voice': voice,
            'response_format': response_format,
            'speed': speed
        }
        
        response = requests.post(
            f'{self.base_url}/v1/api/audio/speech',
            headers=headers,
            json=data
        )
        
        if response.status_code != 200:
            error_data = response.json()
            raise Exception(f"API Error ({response.status_code}): {error_data.get('error', {}).get('message', 'Unknown error')}")
        
        return response.json()

# Usage example
def main():
    api_key = "sk-your-api-key-here"
    client = SexyVoiceAPI(api_key)
    
    try:
        result = client.generate_speech(
            input_text="Hello, welcome to SexyVoice.ai! This is a demonstration of our AI voice technology.",
            voice="alloy",
            response_format="mp3"
        )
        
        print(f"Audio generated: {result['url']}")
        print(f"Credits used: {result['credits_used']}")
        print(f"Credits remaining: {result['credits_remaining']}")
        
        # Download the audio file
        audio_response = requests.get(result['url'])
        with open('generated_audio.mp3', 'wb') as f:
            f.write(audio_response.content)
        print("Audio saved as generated_audio.mp3")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
```

### cURL

```bash
#!/bin/bash

# Set your API key
API_KEY="sk-your-api-key-here"

# Basic speech generation
curl -X POST "https://sexyvoice.ai/v1/api/audio/speech" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "tts-1",
    "input": "Hello, welcome to SexyVoice.ai! This is a demonstration of our AI voice technology.",
    "voice": "alloy",
    "response_format": "mp3"
  }'

# Example with error handling and audio download
API_KEY="sk-your-api-key-here"
TEXT="Welcome to SexyVoice.ai, the leading platform for AI voice generation."
VOICE="nova"
FORMAT="wav"

# Generate speech and capture response
RESPONSE=$(curl -s -X POST "https://sexyvoice.ai/v1/api/audio/speech" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"model\": \"tts-1\",
    \"input\": \"$TEXT\",
    \"voice\": \"$VOICE\",
    \"response_format\": \"$FORMAT\"
  }")

# Check if request was successful
if echo "$RESPONSE" | grep -q '"url"'; then
  # Extract the audio URL
  AUDIO_URL=$(echo "$RESPONSE" | grep -o '"url":"[^"]*' | cut -d'"' -f4)
  CREDITS_REMAINING=$(echo "$RESPONSE" | grep -o '"credits_remaining":[^,}]*' | cut -d':' -f2)
  
  echo "Speech generated successfully!"
  echo "Audio URL: $AUDIO_URL"
  echo "Credits remaining: $CREDITS_REMAINING"
  
  # Download the audio file
  curl -o "generated_speech.$FORMAT" "$AUDIO_URL"
  echo "Audio saved as generated_speech.$FORMAT"
else
  echo "Error generating speech:"
  echo "$RESPONSE"
fi
```

### Advanced Shell Script Example

```bash
#!/bin/bash

# SexyVoice.ai API Client Script
# Usage: ./sexyvoice-cli.sh "Your text here" voice_name [format] [output_file]

set -e

API_KEY="${SEXYVOICE_API_KEY:-}"
BASE_URL="https://sexyvoice.ai"

# Check if API key is set
if [[ -z "$API_KEY" ]]; then
    echo "Error: Please set SEXYVOICE_API_KEY environment variable"
    echo "export SEXYVOICE_API_KEY=sk-your-api-key-here"
    exit 1
fi

# Parse arguments
TEXT="${1:-}"
VOICE="${2:-alloy}"
FORMAT="${3:-mp3}"
OUTPUT_FILE="${4:-generated_audio.$FORMAT}"

if [[ -z "$TEXT" ]]; then
    echo "Usage: $0 \"Your text here\" [voice_name] [format] [output_file]"
    echo "Example: $0 \"Hello world\" alloy mp3 hello.mp3"
    echo ""
    echo "Available voices: alloy, echo, nova, shimmer"
    echo "Available formats: mp3, wav"
    exit 1
fi

echo "Generating speech with SexyVoice.ai..."
echo "Text: $TEXT"
echo "Voice: $VOICE"
echo "Format: $FORMAT"
echo "Output: $OUTPUT_FILE"
echo ""

# Create request payload
REQUEST_DATA=$(jq -n \
  --arg model "tts-1" \
  --arg input "$TEXT" \
  --arg voice "$VOICE" \
  --arg format "$FORMAT" \
  '{
    model: $model,
    input: $input,
    voice: $voice,
    response_format: $format
  }')

# Make API request
RESPONSE=$(curl -s -w "HTTPSTATUS:%{http_code}" \
  -X POST "$BASE_URL/v1/api/audio/speech" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d "$REQUEST_DATA")

# Extract HTTP status and body
HTTP_STATUS=$(echo "$RESPONSE" | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')
BODY=$(echo "$RESPONSE" | sed -e 's/HTTPSTATUS:.*//g')

# Check status code
if [[ $HTTP_STATUS -eq 200 ]]; then
    # Parse response
    AUDIO_URL=$(echo "$BODY" | jq -r '.url')
    CREDITS_USED=$(echo "$BODY" | jq -r '.credits_used')
    CREDITS_REMAINING=$(echo "$BODY" | jq -r '.credits_remaining')
    
    echo "✓ Speech generated successfully!"
    echo "Credits used: $CREDITS_USED"
    echo "Credits remaining: $CREDITS_REMAINING"
    echo ""
    
    # Download audio file
    echo "Downloading audio..."
    if curl -s -o "$OUTPUT_FILE" "$AUDIO_URL"; then
        FILE_SIZE=$(wc -c < "$OUTPUT_FILE")
        echo "✓ Audio saved as $OUTPUT_FILE (${FILE_SIZE} bytes)"
        
        # Play audio if available (optional)
        if command -v afplay >/dev/null 2>&1; then  # macOS
            echo "Playing audio..."
            afplay "$OUTPUT_FILE"
        elif command -v aplay >/dev/null 2>&1; then  # Linux
            echo "Playing audio..."
            aplay "$OUTPUT_FILE"
        fi
    else
        echo "✗ Failed to download audio file"
        exit 1
    fi
else
    echo "✗ API request failed (HTTP $HTTP_STATUS)"
    ERROR_MESSAGE=$(echo "$BODY" | jq -r '.error.message // .error // "Unknown error"')
    echo "Error: $ERROR_MESSAGE"
    exit 1
fi
```

## OpenAPI Specification

The complete OpenAPI 3.0 specification is available at:
- JSON format: `GET /api/openapi`
- Interactive documentation: [View on SwaggerHub](https://sexyvoice.ai/api/openapi)

## Best Practices

1. **Store API Keys Securely**: Never commit API keys to version control. Use environment variables or secure configuration management.

2. **Handle Rate Limits**: Implement exponential backoff when receiving 429 status codes.

3. **Monitor Credit Usage**: Track your credit consumption through the API responses to avoid service interruptions.

4. **Cache Audio Files**: Store generated audio files to avoid regenerating the same content and consuming unnecessary credits.

5. **Error Handling**: Always implement proper error handling for network issues and API errors.

6. **Audio File Management**: The API returns URLs to audio files hosted on our CDN. These URLs are stable but consider downloading and storing important audio files in your own infrastructure.

## Support

- **API Issues**: Contact support@sexyvoice.ai
- **Documentation**: Visit our help center for more guides and examples
- **Status Page**: Check our service status at status.sexyvoice.ai

## Changelog

### v1.0.0 (2025-09-29)
- Initial release of external API
- OpenAI-compatible text-to-speech endpoint
- Support for multiple audio formats (mp3, wav)
- Comprehensive error handling and credit tracking