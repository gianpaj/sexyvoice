Add the support to this Qwen TTS model. follow the instructions to use this API


The Qwen real-time speech synthesis model provides low-latency Text-to-Speech (TTS) with streaming text input and audio output. It offers a variety of human-like voices, supports multiple languages and dialects, and maintains a consistent voice across different languages. The model also automatically adjusts its tone and smoothly processes complex text.

## **Core features**

-   Generates high-fidelity, real-time speech and supports natural-sounding voices in multiple languages, including Chinese and English.
    
-   Provides two voice customization methods: **voice cloning** (cloning a voice from reference audio) and **voice design** (generating a voice from a text description) to quickly create custom voices.
    
-   Supports streaming input and output for low-latency responses in real-time interactive scenarios.
    
-   Enables fine-grained control over speech performance by adjusting speed, pitch, volume, and bitrate.
    
-   Compatible with major audio formats and supports audio output with a sample rate of up to 48 kHz.
    

## **Availability**

**Supported models:**

## International

In the [international deployment mode](/help/en/model-studio/regions/#080da663a75xh), endpoints and data storage are located in **the Singapore region**, and model inference compute resources are dynamically scheduled globally (excluding the Mainland China).

When you call the following models, select an [API Key](https://modelstudio.console.alibabacloud.com/?tab=dashboard#/api-key) from the Singapore region:

-   **Qwen3-TTS-VD-Realtime**: qwen3-tts-vd-realtime-2025-12-16 (snapshot)
    
-   **Qwen3-TTS-VC-Realtime**: qwen3-tts-vc-realtime-2026-01-15 (latest snapshot), qwen3-tts-vc-realtime-2025-11-27 (snapshot)
    
-   **Qwen3-TTS-Flash-Realtime**: qwen3-tts-flash-realtime (stable version, currently equivalent to qwen3-tts-flash-realtime-2025-11-27), qwen3-tts-flash-realtime-2025-11-27 (latest snapshot), qwen3-tts-flash-realtime-2025-09-18 (snapshot)
    

## Mainland China

In the Mainland China [deployment mode](/help/en/model-studio/regions/#080da663a75xh), the endpoint and data storage are located in the **Beijing region**, and the model inference compute resource is limited to the Mainland China.

When you call the following models, select an [API Key](https://bailian.console.alibabacloud.com/?tab=model#/api-key) from the Beijing region:

-   **Qwen3-TTS-VD-Realtime**: qwen3-tts-vd-realtime-2025-12-16 (snapshot)
    
-   **Qwen3-TTS-VC-Realtime**: qwen3-tts-vc-realtime-2026-01-15 (latest snapshot), qwen3-tts-vc-realtime-2025-11-27 (snapshot)
    
-   **Qwen3-TTS-Flash-Realtime**: qwen3-tts-flash-realtime (stable version, currently equivalent to qwen3-tts-flash-realtime-2025-11-27), qwen3-tts-flash-realtime-2025-11-27 (latest snapshot), qwen3-tts-flash-realtime-2025-09-18 (snapshot)
    
-   **Qwen-TTS-Realtime**: qwen-tts-realtime (stable version, currently equivalent to qwen-tts-realtime-2025-07-15), qwen-tts-realtime-latest (latest version, currently equivalent to qwen-tts-realtime-2025-07-15), qwen-tts-realtime-2025-07-15 (snapshot)
    

For more information, see [Models](/help/en/model-studio/models).

## **Model selection**

| **Scenario** | **Recommended model** | **Reason** | **Notes** |
| --- | --- | --- | --- |
| **Customize voices for a brand image, exclusive use, or to extend system voices (based on text description)** | qwen3-tts-vd-realtime-2025-12-16 | Supports voice design. This method creates custom voices from text descriptions without requiring audio samples and is ideal for designing a unique brand voice from scratch. | Does not support [system voices](#422789c49bqqx) or voice cloning. |
| **Customize voices for a brand image, exclusive use, or to extend system voices (based on audio samples)** | qwen3-tts-vc-realtime-2026-01-15 | Supports voice cloning. This method quickly clones voices from real audio samples to create a human-like brand voiceprint, ensuring high fidelity and consistency. | [System voices](#422789c49bqqx) or voice design is not supported. |
| **Intelligent customer service and conversational bots** | qwen3-tts-flash-realtime-2025-11-27 | Supports streaming input and output. Adjustable speed and pitch provide a natural interactive experience. The multi-format audio output adapts to different devices. | Only [system voices](#422789c49bqqx) are supported. Voice cloning or voice design is not supported. |
| **Multilingual content broadcasting** | qwen3-tts-flash-realtime-2025-11-27 | Supports multiple languages and Chinese dialects to meet global content delivery needs. | Only [system voices](#422789c49bqqx) are supported. Voice cloning or voice design is not supported. |
| **Audio reading and content production** | qwen3-tts-flash-realtime-2025-11-27 | Adjustable volume, speed, and pitch meet the fine-grained production requirements for content, such as audiobooks and podcasts. | Only [system voices](#422789c49bqqx) are supported. Neither voice cloning nor voice design is supported. |
| **E-commerce livestreaming and short video dubbing** | qwen3-tts-flash-realtime-2025-11-27 | Supports compressed formats such as MP3 and Opus, which are suitable for bandwidth-limited scenarios. Adjustable parameters meet the needs of different dubbing styles. | Only [system voices](#422789c49bqqx) are supported. Voice cloning and voice design are not supported. |

For more information, see [Model feature comparison](#6e3883d028fqq).

## **Getting started**

Before you run the code, [create and configure an API key](/help/en/model-studio/get-api-key). If you use the SDK to call the service, [install the latest version of the DashScope SDK](/help/en/model-studio/install-sdk).

## Use the DashScope SDK (same as openai)

```
npm install --save openai
```

base_url for SDK:
```
https://dashscope-intl.aliyuncs.com/compatible-mode/v1
```


## Synthesize speech using a designed voice

When you use the voice design feature, the service returns preview audio data. You can listen to the preview audio to ensure that it meets your needs before using it for speech synthesis. This practice helps reduce call costs.

1.  Generate a custom voice and listen to the preview. If you are satisfied, proceed. Otherwise, regenerate the voice.
    
    ### Python
    
    ```
    import requests
    import base64
    import os
    
    def create_voice_and_play():
        # API keys differ between Singapore and Beijing regions. Get your API key: https://www.alibabacloud.com/help/zh/model-studio/get-api-key
        # If you haven't set an environment variable, replace the line below with: api_key = "sk-xxx"
        api_key = os.getenv("DASHSCOPE_API_KEY")
        
        if not api_key:
            print("Error: DASHSCOPE_API_KEY environment variable not found. Please set your API key.")
            return None, None, None
        
        # Prepare request data
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        
        data = {
            "model": "qwen-voice-design",
            "input": {
                "action": "create",
                "target_model": "qwen3-tts-vd-realtime-2025-12-16",
                "voice_prompt": "A composed middle-aged male announcer with a deep, rich and magnetic voice, a steady speaking speed and clear articulation, is suitable for news broadcasting or documentary commentary.",
                "preview_text": "Dear listeners, hello everyone. Welcome to the evening news.",
                "preferred_name": "announcer",
                "language": "en"
            },
            "parameters": {
                "sample_rate": 24000,
                "response_format": "wav"
            }
        }
        
        # URL for Singapore region. For Beijing region, use: https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization
        url = "https://dashscope-intl.aliyuncs.com/api/v1/services/audio/tts/customization"
        
        try:
            # Send request
            response = requests.post(
                url,
                headers=headers,
                json=data,
                timeout=60  # Add timeout setting
            )
            
            if response.status_code == 200:
                result = response.json()
                
                # Get voice name
                voice_name = result["output"]["voice"]
                print(f"Voice name: {voice_name}")
                
                # Get preview audio data
                base64_audio = result["output"]["preview_audio"]["data"]
                
                # Decode Base64 audio data
                audio_bytes = base64.b64decode(base64_audio)
                
                # Save audio file locally
                filename = f"{voice_name}_preview.wav"
                
                # Write audio data to local file
                with open(filename, 'wb') as f:
                    f.write(audio_bytes)
                
                print(f"Audio saved to local file: {filename}")
                print(f"File path: {os.path.abspath(filename)}")
                
                return voice_name, audio_bytes, filename
            else:
                print(f"Request failed. Status code: {response.status_code}")
                print(f"Response: {response.text}")
                return None, None, None
                
        except requests.exceptions.RequestException as e:
            print(f"Network request error: {e}")
            return None, None, None
        except KeyError as e:
            print(f"Response format error: missing required field: {e}")
            print(f"Response: {response.text if 'response' in locals() else 'No response'}")
            return None, None, None
        except Exception as e:
            print(f"Unexpected error: {e}")
            return None, None, None
    
    if __name__ == "__main__":
        print("Creating voice...")
        voice_name, audio_data, saved_filename = create_voice_and_play()
        
        if voice_name:
            print(f"\nSuccessfully created voice '{voice_name}'")
            print(f"Audio file saved: '{saved_filename}'")
            print(f"File size: {os.path.getsize(saved_filename)} bytes")
        else:
            print("\nVoice creation failed")
    ```
    
2.  Use the custom voice generated in the previous step for speech synthesis.
    
    This example is based on the "server commit mode" of the DashScope SDK for speech synthesis using a system voice. Replace the `voice` parameter with the custom voice generated by voice design.
    
    **Key Principle**: The model used during voice design (`target_model`) must be the same as the model used for subsequent speech synthesis (`model`). Otherwise, the synthesis will fail.
    
    ### Python
    
    ```py
    # coding=utf-8
    # Installation instructions for pyaudio:
    # APPLE Mac OS X
    #   brew install portaudio
    #   pip install pyaudio
    # Debian/Ubuntu
    #   sudo apt-get install python-pyaudio python3-pyaudio
    #   or
    #   pip install pyaudio
    # CentOS
    #   sudo yum install -y portaudio portaudio-devel && pip install pyaudio
    # Microsoft Windows
    #   python -m pip install pyaudio
    
    import pyaudio
    import os
    import base64
    import threading
    import time
    import dashscope  # DashScope Python SDK version 1.23.9 or later is required
    from dashscope.audio.qwen_tts_realtime import QwenTtsRealtime, QwenTtsRealtimeCallback, AudioFormat
    
    # ======= Constant Configuration =======
    TEXT_TO_SYNTHESIZE = [
        'Right? I just love this kind of supermarket,',
        'especially during the New Year.',
        'Going to the supermarket',
        'just makes me feel',
        'super, super happy!',
        'I want to buy so many things!'
    ]
    
    def init_dashscope_api_key():
        """
        Initializes the DashScope SDK API key
        """
        # API keys differ between Singapore and Beijing regions. Get your API key: https://www.alibabacloud.com/help/zh/model-studio/get-api-key
        # If you haven't set an environment variable, replace the line below with: dashscope.api_key = "sk-xxx"
        dashscope.api_key = os.getenv("DASHSCOPE_API_KEY")
    
    # ======= Callback Class =======
    class MyCallback(QwenTtsRealtimeCallback):
        """
        Custom TTS streaming callback
        """
        def __init__(self):
            self.complete_event = threading.Event()
            self._player = pyaudio.PyAudio()
            self._stream = self._player.open(
                format=pyaudio.paInt16, channels=1, rate=24000, output=True
            )
    
        def on_open(self) -> None:
            print('[TTS] Connection established')
    
        def on_close(self, close_status_code, close_msg) -> None:
            self._stream.stop_stream()
            self._stream.close()
            self._player.terminate()
            print(f'[TTS] Connection closed, code={close_status_code}, msg={close_msg}')
    
        def on_event(self, response: dict) -> None:
            try:
                event_type = response.get('type', '')
                if event_type == 'session.created':
                    print(f'[TTS] Session started: {response["session"]["id"]}')
                elif event_type == 'response.audio.delta':
                    audio_data = base64.b64decode(response['delta'])
                    self._stream.write(audio_data)
                elif event_type == 'response.done':
                    print(f'[TTS] Response complete, Response ID: {qwen_tts_realtime.get_last_response_id()}')
                elif event_type == 'session.finished':
                    print('[TTS] Session finished')
                    self.complete_event.set()
            except Exception as e:
                print(f'[Error] Exception processing callback event: {e}')
    
        def wait_for_finished(self):
            self.complete_event.wait()
    
    # ======= Main Execution Logic =======
    if __name__ == '__main__':
        init_dashscope_api_key()
        print('[System] Initializing Qwen TTS Realtime ...')
    
        callback = MyCallback()
        qwen_tts_realtime = QwenTtsRealtime(
            # Voice design and speech synthesis must use the same model
            model="qwen3-tts-vd-realtime-2025-12-16",
            callback=callback,
            # URL for Singapore region. For Beijing region, use: wss://dashscope.aliyuncs.com/api-ws/v1/realtime
            url='wss://dashscope-intl.aliyuncs.com/api-ws/v1/realtime'
        )
        qwen_tts_realtime.connect()
        
        qwen_tts_realtime.update_session(
            voice="myvoice", # Replace the voice parameter with the custom voice generated by voice design
            response_format=AudioFormat.PCM_24000HZ_MONO_16BIT,
            mode='server_commit'
        )
    
        for text_chunk in TEXT_TO_SYNTHESIZE:
            print(f'[Sending text]: {text_chunk}')
            qwen_tts_realtime.append_text(text_chunk)
            time.sleep(0.1)
    
        qwen_tts_realtime.finish()
        callback.wait_for_finished()
    
        print(f'[Metric] session_id={qwen_tts_realtime.get_session_id()}, '
              f'first_audio_delay={qwen_tts_realtime.get_first_audio_delay()}s')
    ```


For more sample code, see [GitHub](https://github.com/aliyun/alibabacloud-bailian-speech-demo/tree/master/samples/conversation/omni).

## **Interaction flow**

## server\_commit mode

Set the `session.mode` of the `session.update` event to `"server_commit"` to enable this mode. The server then automatically manages the timing for text segmentation and synthesis.

The interaction flow is as follows:

1.  When the client sends a `session.update` event, the server responds with the `session.created` and `session.updated` events.
    
2.  The client uses the `input_text_buffer.append` event to append text to the server-side buffer.
    
3.  The server intelligently manages text segmentation and synthesis timing, returning the `response.created`, `response.output_item.added`, `response.content_part.added`, and `response.audio.delta` events.
    
4.  The server sends the `response.audio.done`, `response.content_part.done`, `response.output_item.done`, and `response.done` events after completing the response.
    
5.  The server ends the session by sending the `session.finished` event.
    

| **Lifecycle** | **Client events** | **Server events** |
| --- | --- | --- |
| Session initialization | session.update > Session configuration | session.created > Session created session.updated > Session configuration updated |
| User text input | input\\_text\\_buffer.append > Appends text to the server input\\_text\\_buffer.commit > Immediately synthesizes the text cached on the server session.finish > Notifies the server that there is no more text input | input\\_text\\_buffer.committed > Server received the submitted text |
| Server audio output | None | response.created > Server starts generating a response response.output\\_item.added > New output content is available in the response response.content\\_part.added > New output content is added to the assistant message response.audio.delta > Incrementally generated audio from the model response.content\\_part.done > Streaming of text or audio content for the assistant message is complete response.output\\_item.done > Streaming of the entire output item for the assistant message is complete response.audio.done > Audio generation is complete response.done > Response is complete |

## commit mode

Set the `session.mode` for the `session.update` event to `"commit"` to enable this mode. In this mode, the client must submit the text buffer to the server to receive a response.

The interaction flow is as follows:

1.  When the client sends the `session.update` event, the server responds with the `session.created` and `session.updated` events.
    
2.  The client appends text to the server-side buffer by sending the `input_text_buffer.append` event.
    
3.  The client sends the `input_text_buffer.commit` event to commit the buffer to the server and the `session.finish` event to indicate that text input is complete.
    
4.  The server sends the `response.created` event to initiate response generation.
    
5.  The server sends the `response.output_item.added`, `response.content_part.added`, and `response.audio.delta` events.
    
6.  After the server completes its response, it returns `response.audio.done`, `response.content_part.done`, `response.output_item.done`, and `response.done`.
    
7.  The server responds with `session.finished` to end the session.
    

| **Lifecycle** | **Client events** | **Server events** |
| --- | --- | --- |
| Session initialization | session.update > Session configuration | session.created > Session created session.updated > Session configuration updated |
| User text input | input\\_text\\_buffer.append > Appends text to the buffer input\\_text\\_buffer.commit > Commits the buffer to the server input\\_text\\_buffer.clear > Clears the buffer | input\\_text\\_buffer.committed > Server received the committed text |
| Server audio output | None | response.created > Server starts generating a response response.output\\_item.added > New output content is available in the response response.content\\_part.added > New output content is added to the assistant message response.audio.delta > Incrementally generated audio from the model response.content\\_part.done > Streaming of text or audio content for the assistant message is complete response.output\\_item.done > Streaming of the entire output item for the assistant message is complete response.audio.done > Audio generation is complete response.done > Response is complete |

## **API reference**

[Real-time speech synthesis - Qwen API reference](/help/en/model-studio/qwen-tts-realtime-api-reference/)

[Voice cloning - API reference](/help/en/model-studio/qwen-tts-voice-cloning)

[Voice design - API reference](/help/en/model-studio/qwen-tts-voice-design)

## **Feature comparison**

| **Feature** | **qwen3-tts-vd-realtime-2025-12-16** | **qwen3-tts-vc-realtime-2026-01-15, qwen3-tts-vc-realtime-2025-11-27** | **qwen3-tts-flash-realtime, qwen3-tts-flash-realtime-2025-11-27, qwen3-tts-flash-realtime-2025-09-18** | **qwen-tts-realtime, qwen-tts-realtime-latest, qwen-tts-realtime-2025-07-15** |
| --- | --- | --- | --- | --- |
| **Supported languages** | Chinese, English, Spanish, Russian, Italian, French, Korean, Japanese, German, and Portuguese |   | Chinese (Mandarin, Beijing, Shanghai, Sichuan, Nanjing, Shaanxi, Minnan, Tianjin, and Cantonese, varies by [voice](#422789c49bqqx)), English, Spanish, Russian, Italian, French, Korean, Japanese, German, and Portuguese | Chinese and English |
| **Audio formats** | pcm, wav, mp3, and opus |   |   | pcm |
| **Audio sampling rates** | 8 kHz, 16 kHz, 24 kHz, and 48 kHz |   |   | 24 kHz |
| **Voice cloning** | Not supported | Supported | Not supported |   |
| **Voice design** | Supported | Not supported |   |   |
| **SSML** | Not supported |   |   |   |
| **LaTeX** | Not supported |   |   |   |
| **Volume adjustment** | Supported |   |   | Not supported |
| **Speed adjustment** | Supported |   |   | Not supported |
| **Pitch adjustment** | Supported |   |   | Not supported |
| **Bitrate adjustment** | Supported |   |   | Not supported |
| **Timestamp** | Not supported |   |   |   |
| **Emotion setting** | Not supported |   |   |   |
| **Streaming input** | Supported |   |   |   |
| **Streaming output** | Supported |   |   |   |
| **Rate limit** | Requests per minute (RPM): 180 |   | qwen3-tts-flash-realtime, qwen3-tts-flash-realtime-2025-11-27 RPM: 180 qwen3-tts-flash-realtime-2025-09-18 RPM: 10 | RPM: 10 Tokens per minute (TPM): 100,000 |
| **Access methods** | Java/Python SDK, WebSocket API |   |   |   |
| **Pricing** | International: $0.143353 per 10,000 characters Mainland China: $0.143353 per 10,000 characters | International: $0.13 per 10,000 characters Mainland China: $0.143353 per 10,000 characters |   | Mainland China: - Input cost: $0.345 per 1,000 tokens - Output cost: $1.721 per 1,000 tokens |

## **Supported voices**

Supported voices vary by model. Set the `voice` request parameter to the corresponding value from the **voice parameter** column in the table.

| `**voice**` **parameter** | **Details** | **Supported languages** | **Supported models** |
| `Cherry` | **Name**: Cherry **Description:** A cheerful, positive, friendly, and natural young woman. | Chinese, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean | - **Qwen3-TTS-Flash-Realtime**: qwen3-tts-flash-realtime, qwen3-tts-flash-realtime-2025-11-27, qwen3-tts-flash-realtime-2025-09-18 - **Qwen-TTS-Realtime**: qwen-tts-realtime, qwen-tts-realtime-latest, qwen-tts-realtime-2025-07-15 |
| `Serena` | **Name**: Serena **Description**: Gentle female | Chinese, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean | - **Qwen3-TTS-Flash-Realtime**: qwen3-tts-flash-realtime, qwen3-tts-flash-realtime-2025-11-27 - **Qwen-TTS-Realtime**: qwen-tts-realtime, qwen-tts-realtime-latest, qwen-tts-realtime-2025-07-15 |
| `Ethan` | **Name**: Ethan **Description**: A bright, warm, energetic, and vibrant male voice with a standard Mandarin pronunciation and a slight northern accent. | Chinese, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean | - **Qwen3-TTS-Flash-Realtime**: qwen3-tts-flash-realtime, qwen3-tts-flash-realtime-2025-11-27, qwen3-tts-flash-realtime-2025-09-18 - **Qwen-TTS-Realtime**: qwen-tts-realtime, qwen-tts-realtime-latest, qwen-tts-realtime-2025-07-15 |
| `Chelsie` | **Name**: Chelsie **Description**: 2D virtual girlfriend | Chinese, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean | - **Qwen3-TTS-Flash-Realtime**: qwen3-tts-flash-realtime, qwen3-tts-flash-realtime-2025-11-27 - **Qwen-TTS-Realtime**: qwen-tts-realtime, qwen-tts-realtime-latest, qwen-tts-realtime-2025-07-15 |
| `Momo` | **Name**: Momo **Description**: A playful and cute female voice designed to be cheerful. | Chinese, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean | - **Qwen3-TTS-Flash-Realtime**: qwen3-tts-flash-realtime, qwen3-tts-flash-realtime-2025-11-27 |
| `Vivian` | **Name**: Vivian **Description**: A cool, cute, and slightly feisty female voice. | Chinese, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean | - **Qwen3-TTS-Flash-Realtime**: qwen3-tts-flash-realtime, qwen3-tts-flash-realtime-2025-11-27 |
| `Moon` | **Name**: Moon **Description**: Moon White (male), spirited and handsome | Chinese, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean | - **Qwen3-TTS-Flash-Realtime**: qwen3-tts-flash-realtime, qwen3-tts-flash-realtime-2025-11-27 |
| `Maia` | **Name**: Maia **Description**: A female voice that blends intelligence with gentleness. | Chinese, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean | - **Qwen3-TTS-Flash-Realtime**: qwen3-tts-flash-realtime, qwen3-tts-flash-realtime-2025-11-27 |
| `Kai` | **Name**: Kai **Description**: A soothing voice that is like a spa for your ears. | Chinese, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean | - **Qwen3-TTS-Flash-Realtime**: qwen3-tts-flash-realtime, qwen3-tts-flash-realtime-2025-11-27 |
| `Nofish` | **Name**: Nofish **Description**: A male designer who cannot pronounce the 'sh' or 'zh' sounds. | Chinese, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean | - **Qwen3-TTS-Flash-Realtime**: qwen3-tts-flash-realtime, qwen3-tts-flash-realtime-2025-11-27, qwen3-tts-flash-realtime-2025-09-18 |
| `Bella` | **Name**: Bella **Description**: A young girl who drinks alcohol but does not practice Drunken Fist. | Chinese, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean | - **Qwen3-TTS-Flash-Realtime**: qwen3-tts-flash-realtime, qwen3-tts-flash-realtime-2025-11-27 |
| `Jennifer` | **Name**: Jennifer **Description**: A premium, cinematic American English female voice. | Chinese, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean | - **Qwen3-TTS-Flash-Realtime**: qwen3-tts-flash-realtime, qwen3-tts-flash-realtime-2025-11-27, qwen3-tts-flash-realtime-2025-09-18 |
| `Ryan` | **Name**: Ryan **Description**: A rhythmic and dramatic voice with a sense of realism and tension. | Chinese, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean | - **Qwen3-TTS-Flash-Realtime**: qwen3-tts-flash-realtime, qwen3-tts-flash-realtime-2025-11-27, qwen3-tts-flash-realtime-2025-09-18 |
| `Katerina` | **Name**: Katerina **Description**: A mature female voice with a rich rhythm and lingering resonance. | Chinese, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean | - **Qwen3-TTS-Flash-Realtime**: qwen3-tts-flash-realtime, qwen3-tts-flash-realtime-2025-11-27, qwen3-tts-flash-realtime-2025-09-18 |
| `Aiden` | **Name**: Aiden **Description**: The voice of a young American man who is skilled in cooking. | Chinese, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean | - **Qwen3-TTS-Flash-Realtime**: qwen3-tts-flash-realtime, qwen3-tts-flash-realtime-2025-11-27 |
| `Eldric Sage` | **Name**: Eldric Sage **Description**: A calm and wise old man, with the weathered appearance of a pine tree but a mind as clear as a mirror (male) | Chinese, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean | - **Qwen3-TTS-Flash-Realtime**: qwen3-tts-flash-realtime, qwen3-tts-flash-realtime-2025-11-27 |
| `Mia` | **Name**: Mia **Description**: Gentle as spring water and pure as the first snow (female) | Chinese, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean | - **Qwen3-TTS-Flash-Realtime**: qwen3-tts-flash-realtime, qwen3-tts-flash-realtime-2025-11-27 |
| `Mochi` | **Name**: Mochi **Description**: The voice of a clever and bright "little adult" who retains childlike innocence yet possesses Zen-like wisdom. | Chinese, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean | - **Qwen3-TTS-Flash-Realtime**: qwen3-tts-flash-realtime, qwen3-tts-flash-realtime-2025-11-27 |
| `Bellona` | **Name**: Bellona **Description**: A powerful and sonorous voice with clear articulation that brings characters to life and stirs passion in the listener. The clash of swords and the thunder of hooves echo in your dreams, revealing a world of countless voices through perfectly clear and resonant tones. | Chinese, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean | - **Qwen3-TTS-Flash-Realtime**: qwen3-tts-flash-realtime, qwen3-tts-flash-realtime-2025-11-27 |
| `Vincent` | **Name**: Vincent **Description**: A uniquely raspy and smoky voice that instantly evokes tales of vast armies and heroic adventures. | Chinese, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean | - **Qwen3-TTS-Flash-Realtime**: qwen3-tts-flash-realtime, qwen3-tts-flash-realtime-2025-11-27 |
| `Bunny` | **Name**: Bunny **Description**: A female character brimming with "moe" traits. | Chinese, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean | - **Qwen3-TTS-Flash-Realtime**: qwen3-tts-flash-realtime, qwen3-tts-flash-realtime-2025-11-27 |
| `Neil` | **Name**: Neil **Description**: A professional news anchor's voice with a flat baseline intonation and precise, clear pronunciation. | Chinese, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean | - **Qwen3-TTS-Flash-Realtime**: qwen3-tts-flash-realtime, qwen3-tts-flash-realtime-2025-11-27 |
| `Elias` | **Name**: Elias **Description**: Maintains academic rigor and uses narrative techniques to break down complex topics into digestible modules (female). | Chinese, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean | - **Qwen3-TTS-Flash-Realtime**: qwen3-tts-flash-realtime, qwen3-tts-flash-realtime-2025-11-27, qwen3-tts-flash-realtime-2025-09-18 |
| `Arthur` | **Name**: Arthur **Description**: A rustic voice, weathered by time and dry tobacco, that leisurely recounts village tales and oddities. | Chinese, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean | - **Qwen3-TTS-Flash-Realtime**: qwen3-tts-flash-realtime, qwen3-tts-flash-realtime-2025-11-27 |
| `Nini` | **Name**: Nini **Description**: A soft and sticky voice, like mochi, whose drawn-out calls of "older brother" are sweet enough to melt your bones. | Chinese, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean | - **Qwen3-TTS-Flash-Realtime**: qwen3-tts-flash-realtime, qwen3-tts-flash-realtime-2025-11-27 |
| `Ebona` | **Name**: Ebona **Description**: A whispery voice that is like a rusty key slowly turning in the darkest corners of your innermost self, where all your unacknowledged childhood shadows and unknown fears lie hidden. | Chinese, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean | - **Qwen3-TTS-Flash-Realtime**: qwen3-tts-flash-realtime, qwen3-tts-flash-realtime-2025-11-27 |
| `Seren` | **Name**: Seren **Description**: A gentle and soothing voice to help you fall asleep faster. Good night and sweet dreams. | Chinese, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean | - **Qwen3-TTS-Flash-Realtime**: qwen3-tts-flash-realtime, qwen3-tts-flash-realtime-2025-11-27 |
| `Pip` | **Name**: Pip **Description:** Naughty and mischievous, yet retaining a childlike innocence. Is this the Shin-chan you remember? (male) | Chinese, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean | - **Qwen3-TTS-Flash-Realtime**: qwen3-tts-flash-realtime, qwen3-tts-flash-realtime-2025-11-27 |
| `Stella` | **Name**: Stella **Description**: A voice that is normally sickeningly sweet and dazed, but when shouting "In the name of the moon, I'll punish you!", it instantly fills with undeniable love and justice. | Chinese, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean | - **Qwen3-TTS-Flash-Realtime**: qwen3-tts-flash-realtime, qwen3-tts-flash-realtime-2025-11-27 |
| `Bodega` | **Name**: Bodega **Description**: Enthusiastic Spanish uncle | Chinese, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean | - **Qwen3-TTS-Flash-Realtime**: qwen3-tts-flash-realtime, qwen3-tts-flash-realtime-2025-11-27 |
| `Sonrisa` | **Name**: Sonrisa **Description**: A warm and outgoing Latin American woman. | Chinese, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean | - **Qwen3-TTS-Flash-Realtime**: qwen3-tts-flash-realtime, qwen3-tts-flash-realtime-2025-11-27 |
| `Alek` | **Name**: Alek **Description**: A voice that sounds cold at first, like Russia, yet is warm beneath the wool coat. | Chinese, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean | - **Qwen3-TTS-Flash-Realtime**: qwen3-tts-flash-realtime, qwen3-tts-flash-realtime-2025-11-27 |
| `Dolce` | **Name**: Dolce **Description**: A laid-back, middle-aged Italian man | Chinese, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean | - **Qwen3-TTS-Flash-Realtime**: qwen3-tts-flash-realtime, qwen3-tts-flash-realtime-2025-11-27 |
| `Sohee` | **Name**: Sohee **Description**: A gentle, cheerful, and emotionally expressive Korean older-sister figure. | Chinese, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean | - **Qwen3-TTS-Flash-Realtime**: qwen3-tts-flash-realtime, qwen3-tts-flash-realtime-2025-11-27 |
| `Ono Anna` | **Name**: Ono Anna **Description**: A spirited and mischievous young woman and childhood sweetheart. | Chinese, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean | - **Qwen3-TTS-Flash-Realtime**: qwen3-tts-flash-realtime, qwen3-tts-flash-realtime-2025-11-27 |
| `Lenn` | **Name**: Lenn **Description**: Rational at the core, but rebellious in the details—a young German man who wears a suit and listens to post-punk. | Chinese, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean | - **Qwen3-TTS-Flash-Realtime**: qwen3-tts-flash-realtime, qwen3-tts-flash-realtime-2025-11-27 |
| `Emilien` | **Name**: Emilien **Description**: A romantic and mature French male | Chinese, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean | - **Qwen3-TTS-Flash-Realtime**: qwen3-tts-flash-realtime, qwen3-tts-flash-realtime-2025-11-27 |
| `Andre` | **Name**: Andre **Description**: A magnetic, natural, comfortable, and calm male voice. | Chinese, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean | - **Qwen3-TTS-Flash-Realtime**: qwen3-tts-flash-realtime, qwen3-tts-flash-realtime-2025-11-27 |
| `Radio Gol` | **Name**: Radio Gol **Description**: The voice of the football poet Rádio Gol! "Today I will call the football match for you using names." | Chinese, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean | - **Qwen3-TTS-Flash-Realtime**: qwen3-tts-flash-realtime, qwen3-tts-flash-realtime-2025-11-27 |
| `Jada` | **Name**: Shanghai-Jada **Description**: An energetic woman from Shanghai | Chinese (Shanghainese), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean | - **Qwen3-TTS-Flash-Realtime**: qwen3-tts-flash-realtime, qwen3-tts-flash-realtime-2025-11-27, qwen3-tts-flash-realtime-2025-09-18 |
| `Dylan` | **Name**: Beijing-Dylan **Description**: A teenage boy who grew up in the hutongs of Beijing. | Chinese (Beijing dialect), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean | - **Qwen3-TTS-Flash-Realtime**: qwen3-tts-flash-realtime, qwen3-tts-flash-realtime-2025-11-27, qwen3-tts-flash-realtime-2025-09-18 |
| `Li` | **Name**: Nanjing-Li **Description**: A patient, male yoga teacher. | Chinese (Nanjing dialect), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean | - **Qwen3-TTS-Flash-Realtime**: qwen3-tts-flash-realtime, qwen3-tts-flash-realtime-2025-11-27, qwen3-tts-flash-realtime-2025-09-18 |
| `Marcus` | **Name**: Shaanxi-Marcus **Description**: A voice that is broad-faced and brief-spoken, sincere-hearted and deep-voiced—the authentic flavor of Shaanxi. | Chinese (Shaanxi dialect), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean | - **Qwen3-TTS-Flash-Realtime**: qwen3-tts-flash-realtime, qwen3-tts-flash-realtime-2025-11-27, qwen3-tts-flash-realtime-2025-09-18 |
| `Roy` | **Name**: Minnan-Roy **Description**: The voice of a humorous, straightforward, and lively young Taiwanese man. | Chinese (Min Nan), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean | - **Qwen3-TTS-Flash-Realtime**: qwen3-tts-flash-realtime, qwen3-tts-flash-realtime-2025-11-27, qwen3-tts-flash-realtime-2025-09-18 |
| `Peter` | **Name**: Tianjin-Peter **Description**: The voice of a professional straight man in Tianjin crosstalk. | Chinese (Tianjin dialect), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean | - **Qwen3-TTS-Flash-Realtime**: qwen3-tts-flash-realtime, qwen3-tts-flash-realtime-2025-11-27, qwen3-tts-flash-realtime-2025-09-18 |
| `Sunny` | **Name**: Sichuan-Sunny **Description**: The voice of a Sichuan girl whose sweetness melts your heart. | Chinese (Sichuanese), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean | - **Qwen3-TTS-Flash-Realtime**: qwen3-tts-flash-realtime, qwen3-tts-flash-realtime-2025-11-27, qwen3-tts-flash-realtime-2025-09-18 |
| `Eric` | **Name**: Sichuan-Eric **Description**: A man from Chengdu, Sichuan, who is detached from the mundane. | Chinese (Sichuanese), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean | - **Qwen3-TTS-Flash-Realtime**: qwen3-tts-flash-realtime, qwen3-tts-flash-realtime-2025-11-27, qwen3-tts-flash-realtime-2025-09-18 |
| `Rocky` | **Name**: Cantonese-Rocky **Description**: The voice of the humorous and witty Rocky, here for online chatting. | Chinese (Cantonese), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean | - **Qwen3-TTS-Flash-Realtime**: qwen3-tts-flash-realtime, qwen3-tts-flash-realtime-2025-11-27, qwen3-tts-flash-realtime-2025-09-18 |
| `Kiki` | **Name**: Cantonese-Kiki **Description**: A sweet best female friend from Hong Kong. | Chinese (Cantonese), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean | - **Qwen3-TTS-Flash-Realtime**: qwen3-tts-flash-realtime, qwen3-tts-flash-realtime-2025-11-27, qwen3-tts-flash-realtime-2025-09-18 |
```


Consider that a voice will use this model:
`qwen3-tts-vd-realtime-2025-12-16` 

and not stream the audio. just the binary audio buffer


--- 

# Qwen TTS Integration Guide

## Overview

SexyVoice.ai now supports Alibaba Cloud's Qwen TTS Voice Design model (`qwen3-tts-vd-realtime-2025-12-16`) for creating custom voices from text descriptions. This integration enables users to design unique voices without requiring audio samples, complementing the existing voice cloning and system voice generation features.

## Features

- **Voice Design**: Create custom voices from text descriptions
- **No Audio Required**: Unlike voice cloning, no audio samples needed
- **Real-time Synthesis**: WebSocket-based low-latency speech generation
- **Flexible Audio Formats**: Support for WAV, PCM, MP3, and Opus
- **Adjustable Parameters**: Control speed, pitch, and volume
- **Multiple Sample Rates**: 8kHz, 16kHz, 24kHz, and 48kHz support
- **20+ Languages**: Support for Chinese (multiple dialects), English, Spanish, Russian, Italian, French, Korean, Japanese, German, Portuguese, and more

## Architecture

### Components

#### 1. **Qwen TTS Module** (`lib/qwen-tts.ts`)
Core integration module containing:
- `generateQwenTTS()` - Main function for speech synthesis
- `isQwenModel()` - Helper to detect Qwen models
- `isQwenVoiceDesignModel()` - Check for Voice Design model
- WebSocket connection management
- Audio chunk buffering and finalization
- WAV header generation for audio output

#### 2. **API Route Integration** (`app/api/generate-voice/route.ts`)
Modified to handle Qwen TTS:
- Model detection via `isQwenModel()`
- Conditional routing based on model type
- Error handling with `QWEN_TTS_ERROR` code
- Session and response ID tracking
- Credit deduction and analytics

#### 3. **Credit System Updates** (`lib/utils.ts`)
- Added `QWEN_TTS_ERROR` to error codes
- Credit multiplier: 1.2x for Qwen models
- Character-based pricing: $0.143353 per 10,000 characters

#### 4. **Character Limit** (`lib/ai.ts`)
- Qwen TTS character limit: 1000 characters per request
- Same as Gemini to maintain consistency

## Setup

### Prerequisites

1. **Alibaba Cloud Account**: Sign up at [Alibaba Cloud Console](https://www.alibabacloud.com/)
2. **DashScope API Key**: Create and configure an API key from Singapore region
3. **Environment Variable**: Add to `.env.local`

```bash
DASHSCOPE_API_KEY=sk-your-dashscope-api-key-here
```

### Voice Creation Workflow

Before using Qwen TTS in SexyVoice.ai, you need to create a custom voice:

#### Step 1: Generate a Voice via Voice Design API

Use the Qwen voice design API to create a custom voice:

```python
import requests
import base64
import os

api_key = "your-dashscope-api-key"
headers = {
    "Authorization": f"Bearer {api_key}",
    "Content-Type": "application/json"
}

data = {
    "model": "qwen-voice-design",
    "input": {
        "action": "create",
        "target_model": "qwen3-tts-vd-realtime-2025-12-16",
        "voice_prompt": "A composed middle-aged male announcer with a deep, rich and magnetic voice",
        "preview_text": "Dear listeners, hello everyone.",
        "preferred_name": "announcer",
        "language": "en"
    },
    "parameters": {
        "sample_rate": 24000,
        "response_format": "wav"
    }
}

url = "https://dashscope-intl.aliyuncs.com/api/v1/services/audio/tts/customization"
response = requests.post(url, headers=headers, json=data)
result = response.json()

# Get the voice name from response
voice_name = result["output"]["voice"]
print(f"Voice created: {voice_name}")
```

#### Step 2: Add Voice to Database

Add the created voice to the SexyVoice.ai database:

```sql
INSERT INTO voices (
  name,
  model,
  language,
  user_id,
  is_public,
  sample_prompt,
  sample_url
) VALUES (
  'announcer',
  'qwen3-tts-vd-realtime-2025-12-16',
  'en',
  'user-uuid-here',
  true,
  'Dear listeners, hello everyone.',
  'url-to-preview-audio'
);
```

Or via API:

```typescript
const supabase = await createClient();
await supabase.from('voices').insert({
  name: 'announcer',
  model: 'qwen3-tts-vd-realtime-2025-12-16',
  language: 'en',
  user_id: userId,
  is_public: true,
});
```

#### Step 3: Use in SexyVoice.ai

Once added to the database, users can select the voice and generate speech:

```typescript
const response = await fetch('/api/generate-voice', {
  method: 'POST',
  body: JSON.stringify({
    voice: 'announcer',
    text: 'Generate this text with my custom voice',
  }),
});

const { url } = await response.json();
// Audio file ready at `url`
```

## API Details

### WebSocket Flow

The Qwen TTS integration uses WebSocket for low-latency synthesis:

```
1. Client connects to WebSocket
2. Client sends session.update with voice configuration
3. Server responds with session.created and session.updated
4. Client sends text via input_text_buffer.append
5. Server generates audio and sends response.audio.delta events (chunks)
6. Client buffers all audio chunks
7. Server sends response.done when generation complete
8. Server closes session with session.finished
9. Client combines all chunks and returns audio buffer
```

### Request Options

```typescript
interface QwenTTSOptions {
  voice: string;              // Voice name (from voice design)
  text: string;               // Text to synthesize
  sampleRate?: 8000 | 16000 | 24000 | 48000;  // Default: 24000
  responseFormat?: 'wav' | 'pcm' | 'mp3' | 'opus';  // Default: 'wav'
  speed?: number;             // 0.5 - 2.0, Default: 1.0
  pitch?: number;             // -500 to 500, Default: 0
  volume?: number;            // 0 - 100, Default: 50
  signal?: AbortSignal;       // Optional abort signal
}
```

### Response

```typescript
interface QwenTTSResult {
  audioBuffer: Buffer;  // Raw audio data with WAV header if format is 'wav'
  sessionId: string;    // WebSocket session ID
  responseId: string;   // Response ID from API
}
```

## Error Handling

### Error Codes

Qwen TTS errors are tracked with `QWEN_TTS_ERROR` code:

```typescript
export const ERROR_CODES = {
  QWEN_TTS_ERROR: 'QWEN_TTS_ERROR',
  // ... other codes
};

export const ERROR_STATUS_CODES = {
  QWEN_TTS_ERROR: 500,
  // ... other codes
};
```

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| "DASHSCOPE_API_KEY environment variable is not set" | Missing API key | Add `DASHSCOPE_API_KEY` to `.env.local` |
| WebSocket connection closed unexpectedly | Network issue or API error | Check API status, retry request |
| Request timeout | Generation took >5 minutes | Reduce text length or try again |
| Session not created | API authentication failed | Verify API key is correct and active |
| Audio buffer empty | Connection closed before audio received | Check text is valid and API is responding |

## Credit Calculation

Qwen TTS uses character-based pricing:

```
Credits = (characters / 10000) * 0.143353 * 1.2 (multiplier)
```

Examples:
- 100 characters: ~0.17 credits
- 500 characters: ~0.86 credits
- 1000 characters: ~1.72 credits

Estimation function:

```typescript
estimateCredits("Your text here", "announcer", "qwen3-tts-vd-realtime-2025-12-16")
// Returns: estimated credit cost
```

## Performance Considerations

### Latency
- First audio chunk received: ~500-1000ms (depends on text length and API load)
- Complete audio generation: ~2-10 seconds (varies with text length)
- Network round-trip: Included in above times

### Buffering
- Audio chunks received during synthesis are buffered in memory
- Typical buffer size: 50KB-500KB depending on text length
- WAV header added after all chunks received

### Connection
- WebSocket connection kept alive during synthesis
- Automatic cleanup on completion or error
- 5-minute timeout for entire operation

## Development Guidelines

### Testing

Test the Qwen TTS integration:

```bash
# Run all tests
pnpm test

# Run specific test
pnpm test -- generate-voice.test.ts

# Test with coverage
pnpm test:coverage
```

### Adding New Qwen Models

To support additional Qwen TTS models in the future:

1. Update `lib/qwen-tts.ts`:
   ```typescript
   const QWEN_TTS_MODEL = 'new-model-name';
   ```

2. Add to database `voices` table:
   ```sql
   INSERT INTO voices (model, ...) VALUES ('new-model-name', ...);
   ```

3. No changes needed to `generate-voice/route.ts` - it automatically detects Qwen models

### Debugging

Enable verbose logging:

```typescript
// In lib/qwen-tts.ts, set NODE_ENV='development'
if (process.env.NODE_ENV === 'development') {
  console.log('Qwen TTS event:', eventType, data);
}
```

Monitor WebSocket events via Sentry:

```typescript
logger.info('Qwen TTS session created', { sessionId });
logger.error('Qwen TTS error', { error });
```

## Supported Languages

Qwen TTS supports speech synthesis in:

- **Chinese**: Mandarin, Beijing dialect, Shanghai dialect, Sichuan dialect, Nanjing dialect, Shaanxi dialect, Min Nan, Tianjin dialect, Cantonese
- **European**: English, Spanish, Russian, Italian, French, German, Portuguese, Dutch, Polish, Romanian
- **Asian**: Korean, Japanese, Hindi, Indonesian, Thai, Vietnamese, Bengali, Marathi, Tamil, Telugu
- **Others**: Turkish, Ukrainian

Specify language in voice design prompt (e.g., "A female voice suitable for English content").

## Troubleshooting

### Connection Issues

**Problem**: WebSocket connection fails
```
Error: "WebSocket error in Qwen TTS"
```

**Solution**:
1. Verify `DASHSCOPE_API_KEY` is set and valid
2. Check API key is from Singapore region
3. Ensure network connectivity
4. Check API status at Alibaba Cloud Console

### Timeout Issues

**Problem**: "Qwen TTS request timeout"

**Solution**:
1. Reduce text length (max 1000 characters)
2. Check API load - retry after a few seconds
3. Increase timeout in `lib/qwen-tts.ts` if needed

### Audio Quality Issues

**Problem**: Generated audio has issues

**Solution**:
1. Refine voice description in voice design API
2. Use preview audio to validate voice before use
3. Adjust speed/pitch parameters
4. Try different sample rate if supported

## References

- [Alibaba Cloud DashScope Documentation](https://help.aliyun.com/zh/model-studio/)
- [Qwen TTS API Reference](https://help.aliyun.com/zh/model-studio/api-reference/qwen-tts-realtime/)
- [Voice Design Guide](https://help.aliyun.com/zh/model-studio/qwen-tts-voice-design)
- [Qwen Models Overview](https://help.aliyun.com/zh/model-studio/models)

## Future Enhancements

Potential improvements for Qwen TTS integration:

1. **Voice Cloning**: Support Qwen Voice Cloning model (`qwen3-tts-vc-realtime`)
2. **Voice Library**: Pre-created voices available in SexyVoice.ai
3. **Advanced Controls**: Fine-grained emotion and intonation control
4. **Streaming Output**: Stream audio directly to client without buffering
5. **Batch Processing**: Synthesize multiple texts efficiently
6. **Caching Optimization**: Cache voice configurations for faster synthesis

## License

This integration follows the SexyVoice.ai project license (MIT).
