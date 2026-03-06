// https://aistudio.google.com/app/apps/bundled/synergy_intro?showAssistant=true&showCode=true

Rewrite this business meeting introduction to be more engaging and expressive, according to the specified persona.
      
Persona: ${persona}

Guidelines:
1. **Natural conversation**: Use patterns of rhythm and expressivity natural to the persona for fluid delivery.
2. **Style control**: Incorporate natural language that steers the delivery to adopt the appropriate tone and expression.
3. **Dynamic performance**: Bring the text to life with energy suitable for the persona (e.g., poetic, newscast, storytelling).
4. **Pace and pronunciation**: Ensure the text allows for clear pronunciation and appropriate pacing.
5. **Accuracy**: Keep all core facts, names, and data accurate.
7. **Format**: Return ONLY the rewritten text without quotes. Keep it in the original language.

Input Text:
"${text}"







@gianpaj/sexyvoice Plan how to make a Batch (background job) audio API route based on the current generate-voice API route.
It will only be used for Gemini voices, and the Google Gemini Batch API (see JavaScript code example)
https://ai.google.dev/gemini-api/docs/batch-api.md.txt?batch=file

we need 
- extra database table (write Supabase migration file) for `jobs`
- The jobs will be scheduled with Innest [1]
- A job can be cancelled
- We'll focus on supporting one job per batch at a time
- The UI will only show the option to toggle the Background job if the text is longer than 500 characters.
- We'll need to show on the History page also the status of Background jobs.
- Make sure to add a test file for this new API route
- The pricing will be 50% cheaper
- We'll need to translate the UI.
- Add integration with OneSignal for job completion notifications. Request permission only when Batch mode is enabled and the user pressed the Generate button

1. see this example https://www.inngest.com/blog/banger-video-rendering-pipeline - in particular, how it handles credits on hold






how do I display an actual progress bar in React . i have a API route which uses a third-party api for AI text generation.

The function looks like this

```ts
    const result = await fal.subscribe(`fal-ai/${modelCode}/text-to-speech`, {
      input,
      logs: false,
      onQueueUpdate: (update) => {
        if (update.status === 'IN_PROGRESS') {
          update.logs?.map((log) => log.message).forEach(console.log);
        }
      },
      abortSignal: request.signal,
    });
```





curl -X POST \
  -H "Authorization: Bearer $GOOGLE_GENERATIVE_AI_API_KEY" \
  -H "x-goog-user-project: $PROJECT_ID" \
  -H "Content-Type: application/json" \
-d '{
  "input": {
    "prompt": "Say the following in a curious way",
    "text": "OK, so... tell me about this [uhm] AI thing."
  },
  "voice": {
    "languageCode": "en-us",
    "name": "Kore",
    "model_name": "gemini-2.5-flash-tts"
  },
  "audioConfig": {
    "audioEncoding": "LINEAR16"
  }
}' \
  "https://texttospeech.googleapis.com/v1/text:synthesize" \
  | jq -r '.audioContent' | base64 -d | ffplay - -autoexit
