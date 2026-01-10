# TODO

- fix: landing page audios not stopping if another audio is played
- add audio clones demos on landing page
  - Bruce Lee
  - Sophia Loren
  - a famous Arab female actor like Nesreen Tafesh
  - a famous Arab male actor like Ahmed Helmy
  - a famous Indian female actor like Aishwarya Rai
  - a famous Indian male actor like Amitabh Bachchan (<https://www.youtube.com/watch?v=6certbViicw>)
- share link & page after an audio has been generated
- Add more GPro female voices: Laomedeia, Leda, Pulcherrima, Vindemiatrix
- Add presets for GPro voices. Adding a DB table for it.
- Add a warning that if using `<emotion>` in GPro voices, these will not be generated as expected
- merge `codex/update-terms-and-conditions-for-retention-policy` branch
- Get stats of `audio_files`. language, style. If using LLM, use batch mode.
- Implement `fakefilter` or `mailchecker` npm packages to block disposable or temporary email address registrations <https://github.com/7c/fakefilter> <https://rapidapi.com/Top-Rated/api/e-mail-check-invalid-or-disposable-domain> e.g `fursee.com`
  - `curl -X GET https://api.usercheck.com/domain/fursee.com`
- RESEARCH: AudioWaveform React component. can it compute the wave form in the browser in a small package and computing resources?
- Return error messages with error codes and translate those in the front-end
- Setup react testing library for the Generate & Clone pages and its components. Including mocking recording a microphone audio input.
- show a Badge translated status of the voice model when cloning multi-lingual . add nextjs headers

  ```js
  fetch("https://replicate.com/resemble-ai/chatterbox-multilingual/status");
  // {"status": "offline"}
  ```

- add noise filter to mic audio in voice cloning

  ```js
  import { useKrispNoiseFilter } from "@livekit/components-react/krisp";

  const { isNoiseFilterEnabled, isNoiseFilterPending, setNoiseFilterEnabled } =
      useKrispNoiseFilter();

  useEffect(() => {
    setNoiseFilterEnabled(true);
  }, [setNoiseFilterEnabled]);
  ```

- daily stats:
  - add num of delete profiles
- Translate pages in Dashboard:
  - Generate
  - History
  - Credits (table headers)
    - Create a pricing table in Spanish and German. (each its own STRIPE_PRICING_ID?)
  - Sidebar
- Translate website to French
- Translate website to Arabic
- Translate website to Indian
- Add option to clean audio using <https://replicate.com/gianpaj/audio_separator> <https://fal.ai/models/fal-ai/deepfilternet3>
- Drip marking - i.e. send an email after the first 5000 credits have been used.
- Add a Share page for individual generated audio files.
  - Allow user to toggle Sharing profile page in Settings.
  - Allow user to upload profile picture? – after `r2` branch is merged
- Crisp and Posthug: add `isPaidUser` from `r2` branch

Ciao, mi chiamo Carlo, <gasp> , e sono un modello di generazione vocale che può sembrare una persona.

> sigh, laugh, cough, sniffle, groan, yawn, gemito, gasp

## SEO

- show more info on the side of the signup page. see <https://ui.shadcn.com/blocks/authentication>
- Page to compare with other TTS services
  - Google HD voice: https://cloud.google.com/text-to-speech?hl=en - doesn't support Speech Synthesis Markup Language (SSML) - price: free up to 1 million characters/month , US$30 per 1 million characters (Chirp 3: HD voices)
  - ElevenLabs

## Analytics

- add Posthog on Login and Signup pages

## Features

- Upload pdf to convert to audio. Long-form context requires splitting into chunks. <https://github.com/Saganaki22/OrpheusTTS-WebUI/blob/b807264412b93f55404d2b50dc0ba8f384585828/orpheus.py#L150>
<https://github.com/isaiahbjork/orpheus-tts-local/pull/23/files>

## Tests

- Setup Playwright for end-to-end testing.
- Uses a test DB (in memory)

## Security

- Implement rate limiting to prevent abuse.
- Add Cloudflare Captcha protection.
- Add hCaptcha to Login and Registration forms <https://docs.hcaptcha.com>

## Maintenance

- add Global error handling <https://nextjs.org/docs/app/api-reference/file-conventions/error>
- Sentry monitoring with Posthog error linking <https://posthog.com/docs/libraries/node#sentry-integration>

## Documentation / Knowledge base site

- <https://nextra.site>

## Later

- Multiple API keys functionality. LLM router (<https://github.com/theopenco/llmgateway>, <https://github.com/BerriAI/litellm>)

## Other Voice cloning demos

- <https://archive.org/details/historysgreatest0000unse>
- Theodore Roosevelt
  - Fellow citizens, we stand at the dawn of a new century, and it is ours to shape with courage and resolve. Remember, the only man who never makes mistakes is the man who never does anything.
- Queen Victoria
  - It is my steadfast wish that we move forward with dignity and compassion. May our empire continue to flourish through unity and understanding.
- Winston Churchill
  - We shall go forward together with resolute hearts. Let us face our challenges with the firmness and courage that have always defined our people.
- Schedule on Grok to research every month top Netflix series which are popular. From those, fine female actress which are 'sex' symbols. Could be in English, Spanish, German, Indian, Arab. From those find video clips of these actress in their series being flirty or seductive.
