# TODO

- merge `r2` branch
  - share link & page after an audio has been generated
  - listened counter?
- Multiple API keys functionality. LLM router (<https://github.com/theopenco/llmgateway>, <https://github.com/BerriAI/litellm>)
- merge `codex/update-terms-and-conditions-for-retention-policy` branch
- add audio clones demos on dashboard
- add audio clones demos on landing page
  - Bruce Lee
  - Marilyn Monroe
  - Sophia Loren
- add multilingual voice cloning
- Get stats of `audio_files`. language, style. If using LLM, use batch mode.
- Implement `fakefilter` or `mailchecker` npm packages to block disposable or temporary email address registrations <https://github.com/7c/fakefilter> <https://rapidapi.com/Top-Rated/api/e-mail-check-invalid-or-disposable-domain> e.g `fursee.com`
  - `curl -X GET https://api.usercheck.com/domain/fursee.com`
- Check security of Supabase tables. Users can't retrieve other users' data (audio_files, credit_transactions, credits or profiles)
- RESEARCH: AudioWaveform React component. can it compute the wave form in the browser in a small package and computing resources?
- Translate pages in Dashboard:
  - Generate
  - History
  - Credits (table headers)
    - Create a pricing table in Spanish and German. (each its own STRIPE_PRICING_ID?)
  - Sidebar
- Translate website to French
- Clone initial public voices. Theodore Roosevelt, Queen Victoria, Winston Churchill <https://archive.org/details/historysgreatest0000unse>
- Drip marking - i.e. send an email after the first 5000 credits have been used.
- Link in footer to FeatureBase <https://sexyvoice.featurebase.app/>
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

## AI server

- Monitor third-party API calls. Which users are making more calls.

## Security

- Implement rate limiting to prevent abuse.
- Add Cloudflare Captcha protection.
- Add hCaptcha to Login and Registration forms <https://docs.hcaptcha.com>

## Maintenance

- add Global error handling <https://nextjs.org/docs/app/api-reference/file-conventions/error>
- Sentry monitoring with Posthog error linking <https://posthog.com/docs/libraries/node#sentry-integration>

## Documentation / Knowledge base site

- <https://nextra.site>
