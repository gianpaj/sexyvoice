# SexyVoice.ai API Reference

The SexyVoice.ai API allows you to generate high-quality AI voices programmatically. This REST API is compatible with OpenAI's text-to-speech API format, making it easy to integrate into existing applications.

## Authentication

All API requests must be authenticated using an API key. You can generate API keys from your profile page in the SexyVoice.ai dashboard.

Include your API key in the Authorization header:

```
Authorization: Bearer sk-your-api-key-here
```

## Base URL

```
https://sexyvoice.ai/api/v1
```

## Endpoints

### Create Speech

`POST /audio/speech`

Generates audio from the input text.

#### Request Body

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `model` | string | Yes | The TTS model to use. Currently only `tts-1` is supported. |
| `input` | string | Yes | The text to generate audio for. Maximum 4,000 characters. |
| `voice` | string | Yes | The voice to use when generating the audio. |
| `speed` | number | No | The speed of the generated audio. Select a value from `0.25` to `4.0`. Default is `1.0`. |

#### Available Voices

The API supports various high-quality voices. Some popular options include:
- `alloy` - Neutral, balanced voice
- `echo` - Clear, professional voice
- `fable` - Expressive, storytelling voice
- `onyx` - Deep, authoritative voice
- `nova` - Bright, friendly voice
- `shimmer` - Warm, engaging voice

For a complete list of available voices, check your dashboard or contact support.

#### Response

Returns a JSON object with the audio URL and credit information:

```json
{
  "data": "https://blob.vercel-storage.com/audio/voice-hash.wav",
  "credits_used": 100,
  "credits_remaining": 9900
}
```

#### Error Responses

The API returns detailed error information in case of failures:

```json
{
  "error": {
    "message": "Invalid API key",
    "type": "invalid_request_error",
    "code": "invalid_api_key"
  }
}
```

Common error codes:
- `invalid_api_key` - The provided API key is invalid
- `insufficient_credits` - Not enough credits to complete the request
- `voice_not_found` - The specified voice is not available
- `input_too_long` - Input text exceeds the maximum length
- `quota_exceeded` - Third-party API quota has been exceeded

## Code Examples

### TypeScript/JavaScript

```typescript
interface SpeechResponse {
  data: string;
  credits_used: number;
  credits_remaining: number;
}

interface SpeechError {
  error: {
    message: string;
    type: string;
    code: string;
  };
}

async function generateSpeech(
  text: string,
  voice: string = 'alloy',
  speed: number = 1.0
): Promise<string> {
  const response = await fetch('https://sexyvoice.ai/api/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer sk-your-api-key-here',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'tts-1',
      input: text,
      voice: voice,
      speed: speed,
    }),
  });

  if (!response.ok) {
    const error: SpeechError = await response.json();
    throw new Error(`Speech generation failed: ${error.error.message}`);
  }

  const result: SpeechResponse = await response.json();
  return result.data; // Returns the audio URL
}

// Usage
try {
  const audioUrl = await generateSpeech(
    'Hello, this is a test of the SexyVoice API!',
    'alloy',
    1.2
  );
  console.log('Audio generated:', audioUrl);
} catch (error) {
  console.error('Error:', error.message);
}
```

### Python

```python
import requests
import json
from typing import Optional, Dict, Any

class SexyVoiceAPI:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://sexyvoice.ai/api/v1"
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
    
    def generate_speech(
        self,
        text: str,
        voice: str = "alloy",
        speed: float = 1.0,
        model: str = "tts-1"
    ) -> Dict[str, Any]:
        """
        Generate speech from text using the SexyVoice API.
        
        Args:
            text: The text to convert to speech (max 4000 characters)
            voice: The voice to use for generation
            speed: Speed of speech (0.25 to 4.0)
            model: TTS model to use (currently only "tts-1" supported)
            
        Returns:
            Dictionary containing audio URL and credit information
            
        Raises:
            requests.exceptions.RequestException: For API errors
        """
        if len(text) > 4000:
            raise ValueError("Text must be 4000 characters or fewer")
            
        if not (0.25 <= speed <= 4.0):
            raise ValueError("Speed must be between 0.25 and 4.0")
        
        payload = {
            "model": model,
            "input": text,
            "voice": voice,
            "speed": speed
        }
        
        response = requests.post(
            f"{self.base_url}/audio/speech",
            headers=self.headers,
            json=payload,
            timeout=300  # 5 minute timeout for longer texts
        )
        
        if response.status_code == 200:
            return response.json()
        else:
            error_data = response.json()
            error_message = error_data.get("error", {}).get("message", "Unknown error")
            raise requests.exceptions.RequestException(
                f"API request failed with status {response.status_code}: {error_message}"
            )

# Usage example
if __name__ == "__main__":
    # Initialize the API client
    api = SexyVoiceAPI("sk-your-api-key-here")
    
    try:
        # Generate speech
        result = api.generate_speech(
            text="Hello world! This is a demonstration of the SexyVoice API.",
            voice="nova",
            speed=1.1
        )
        
        print(f"✅ Speech generated successfully!")
        print(f"🎵 Audio URL: {result['data']}")
        print(f"💳 Credits used: {result['credits_used']}")
        print(f"💰 Credits remaining: {result['credits_remaining']}")
        
        # You can now download or stream the audio from the URL
        audio_response = requests.get(result['data'])
        with open('generated_speech.wav', 'wb') as f:
            f.write(audio_response.content)
        print("🔊 Audio saved as 'generated_speech.wav'")
        
    except ValueError as e:
        print(f"❌ Input validation error: {e}")
    except requests.exceptions.RequestException as e:
        print(f"❌ API error: {e}")
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
```

### cURL

```bash
# Basic request
curl -X POST https://sexyvoice.ai/api/v1/audio/speech \
  -H "Authorization: Bearer sk-your-api-key-here" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "tts-1",
    "input": "Hello, this is a test of the SexyVoice API!",
    "voice": "alloy",
    "speed": 1.0
  }'

# With custom speed
curl -X POST https://sexyvoice.ai/api/v1/audio/speech \
  -H "Authorization: Bearer sk-your-api-key-here" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "tts-1",
    "input": "This will be spoken faster than normal.",
    "voice": "nova",
    "speed": 1.5
  }'

# Save response to file and extract URL
curl -X POST https://sexyvoice.ai/api/v1/audio/speech \
  -H "Authorization: Bearer sk-your-api-key-here" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "tts-1",
    "input": "Let me tell you a story about artificial intelligence.",
    "voice": "fable",
    "speed": 0.9
  }' \
  -o response.json

# Extract the audio URL and download the file
audio_url=$(cat response.json | jq -r '.data')
curl "$audio_url" -o generated_audio.wav

echo "Audio saved as generated_audio.wav"
```

### Advanced Shell Script

```bash
#!/bin/bash

# Configuration
API_KEY="sk-your-api-key-here"
BASE_URL="https://sexyvoice.ai/api/v1"

# Function to generate speech
generate_speech() {
    local text="$1"
    local voice="${2:-alloy}"
    local speed="${3:-1.0}"
    local output_file="${4:-speech.wav}"
    
    echo "🎤 Generating speech..."
    echo "📝 Text: $text"
    echo "🗣️  Voice: $voice"
    echo "⚡ Speed: $speed"
    
    # Make API request
    response=$(curl -s -X POST "$BASE_URL/audio/speech" \
        -H "Authorization: Bearer $API_KEY" \
        -H "Content-Type: application/json" \
        -d "{
            \"model\": \"tts-1\",
            \"input\": \"$text\",
            \"voice\": \"$voice\",
            \"speed\": $speed
        }")
    
    # Check if request was successful
    if echo "$response" | jq -e '.error' > /dev/null; then
        echo "❌ Error: $(echo "$response" | jq -r '.error.message')"
        return 1
    fi
    
    # Extract audio URL
    audio_url=$(echo "$response" | jq -r '.data')
    credits_used=$(echo "$response" | jq -r '.credits_used')
    credits_remaining=$(echo "$response" | jq -r '.credits_remaining')
    
    echo "✅ Speech generated successfully!"
    echo "💳 Credits used: $credits_used"
    echo "💰 Credits remaining: $credits_remaining"
    
    # Download the audio file
    echo "⬇️  Downloading audio..."
    if curl -s "$audio_url" -o "$output_file"; then
        echo "🔊 Audio saved as: $output_file"
        echo "🎵 Audio URL: $audio_url"
        return 0
    else
        echo "❌ Failed to download audio"
        return 1
    fi
}

# Usage examples
generate_speech "Welcome to SexyVoice AI!" "alloy" 1.0 "welcome.wav"

generate_speech "This is a fast announcement!" "nova" 1.8 "fast_announcement.wav"

generate_speech "Once upon a time, in a digital realm far away..." "fable" 0.8 "story_intro.wav"
```

## Rate Limits

- **Requests per minute**: 60 requests per API key
- **Concurrent requests**: 5 concurrent requests per API key
- **Text length**: Maximum 4,000 characters per request

## Credits and Billing

Each API request consumes credits based on:
- Text length (longer text uses more credits)
- Voice model complexity
- Processing time

Credits are deducted only after successful audio generation. Failed requests do not consume credits.

You can monitor your credit usage and purchase additional credits from your dashboard.

## Audio Format

- **Format**: WAV (for Gemini voices) or MP3 (for Replicate voices)
- **Sample Rate**: Varies by model (typically 22kHz or 44.1kHz)
- **Channels**: Mono
- **Bit Depth**: 16-bit

## Best Practices

1. **Cache results**: Audio URLs are cached and reusable for identical requests
2. **Batch processing**: For multiple texts, make separate requests rather than concatenating
3. **Error handling**: Always implement proper error handling for API failures
4. **Rate limiting**: Respect rate limits to avoid request failures
5. **Text formatting**: Use punctuation for natural speech patterns

## Support and Resources

- **Dashboard**: Manage API keys and monitor usage at [https://sexyvoice.ai/dashboard](https://sexyvoice.ai/dashboard)
- **Support**: Contact us through the dashboard for technical assistance
- **Status Page**: Check API status and announcements
- **Community**: Join our community for tips and best practices

## Changelog

### v1.0.0 (Current)
- Initial release with TTS-1 model support
- Support for 6+ high-quality voices
- Variable speed control (0.25x - 4.0x)
- Credit-based billing system
- OpenAI-compatible API format

---

*This documentation is regularly updated. For the latest information, please check your dashboard or contact support.*