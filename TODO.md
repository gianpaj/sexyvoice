# TODO

## External API

- api New Key button: add tooltip and crown showing that's for paid users

## Internationalization

- change all `dict...replace()` to use next-intl functions
- Translate pages in Dashboard:
  - History (table headers)
  - Credits (table headers)
    - Create a pricing table in Spanish and German. (each its own STRIPE_PRICING_ID?)
  - Sidebar
- Translate website to Arabic
- Translate website to Indian

## Audio generation

- add duration to generate audios. if there is a high duration and short text, add warning in `usage` JSON col that the audio may be silent for a long time.
- Add option to clean audio using <https://replicate.com/gianpaj/audio_separator> <https://fal.ai/models/fal-ai/deepfilternet3>

## Landing page

- add character images for each popular voice. Think about a way to generate avatar images
- fix: audios not stopping if another audio is played
- add audio clones demos on landing page
  - Bruce Lee
  - Sophia Loren
  - a famous Arab female actor like Nesreen Tafesh
  - a famous Arab male actor like Ahmed Helmy
  - a famous Indian female actor like Aishwarya Rai
  - a famous Indian male actor like Amitabh Bachchan (<https://www.youtube.com/watch?v=6certbViicw>)

## Voice cloning

- fix: audio should stop if sample Marilyn is selected and is hidden / unmounted
- show a Badge translated status of the voice model when cloning multi-lingual. add nextjs headers

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

## Voices

- analyze and remove unused voices and group by male and female (see < CommandGroup>)
- Add more GPro female voices: Laomedeia, Leda, Pulcherrima, Vindemiatrix
- Add presets for GPro voices. Adding a DB table for it.

## Sharing

- share link & page after an audio has been generated
- Add a Share page for individual generated audio files.
  - Allow user to toggle Sharing profile page in Settings.
  - Allow user to upload profile picture? – after `r2` branch is merged

## Testing

- Mock recording a microphone audio input.

## Agents

- create CLI for API auth <https://github.com/helius-labs/helius-cli>

## Feedback button

- <https://motion-primitives.com/docs/morphing-popover#morphing-popover-with-textarea>

## Billing

- add auto top-up when credit is low. Research

## Payments

- add nowpayments.io to support Crypto

## Call

- test and implement text interruptions <https://github.com/livekit/agents-js/pull/998>

## Analytics

- Update daily-stats API route to include usage and a section for Voice calls. Mins, credits used, Top preset/voice/language and the averages
- Get stats of `audio_files`. language, style. If using LLM, use batch mode.
- add num of deleted profiles
- add Posthog on Login and Signup pages

## New Features

- Upload pdf to convert to audio. Long-form context requires splitting into chunks. <https://github.com/Saganaki22/OrpheusTTS-WebUI/blob/b807264412b93f55404d2b50dc0ba8f384585828/orpheus.py#L150>
  <https://github.com/isaiahbjork/orpheus-tts-local/pull/23/files>

## Security

- Implement `fakefilter` or `mailchecker` npm packages to block disposable or temporary email address registrations <https://github.com/7c/fakefilter> <https://rapidapi.com/Top-Rated/api/e-mail-check-invalid-or-disposable-domain> e.g `fursee.com`
  - `curl -X GET https://api.usercheck.com/domain/fursee.com`
- Implement rate limiting to prevent abuse.
- Add Cloudflare Captcha/Alcha protection.
- Add hCaptcha to Login and Registration forms <https://docs.hcaptcha.com>

## Maintenance

- self-host Sentry on Hetzner machine
- Sentry monitoring with Posthog error linking <https://posthog.com/docs/libraries/node#sentry-integration>

## Research

- Automated Dialogue Replacement (ADR) is a post-production process in filmmaking where actors re-record their dialogue in a studio to improve audio quality or make changes to the script. This technique helps to ensure that the final audio matches the visuals and enhances the overall sound of the film.
- Sound effects (SFX): <https://fal.ai/models/fal-ai/stable-audio>

## Emails

- 'Welcome to SexyVoice!' - Glad to have you on board! – Gianfri
- Drip marking - i.e. send an email after the first 5000 credits have been used.

## Other Voice cloning demos

- <https://archive.org/details/historysgreatest0000unse>
- Theodore Roosevelt
  - Fellow citizens, we stand at the dawn of a new century, and it is ours to shape with courage and resolve. Remember, the only man who never makes mistakes is the man who never does anything.
- Queen Victoria
  - It is my steadfast wish that we move forward with dignity and compassion. May our empire continue to flourish through unity and understanding.
- Winston Churchill
  - We shall go forward together with resolute hearts. Let us face our challenges with the firmness and courage that have always defined our people.
- Schedule on Grok to research every month top Netflix series which are popular. From those, fine female actresses who are 'sex' symbols. Could be in English, Spanish, German, Hindi, Arab. From those, find video clips of these actresses in their series being flirty or seductive.

## Indian TTS

- <https://timepay.ai/products/tts> - has emotion tags
- <https://sarvam.ai>
