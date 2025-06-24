# TODO

- Clone initial public voices. Theodore Roosevelt, Queen Victoria, Winston Churchill <https://archive.org/details/historysgreatest0000unse>
- Translate website to French
- Translate website to German
- Link in footer to FeatureBase <https://sexyvoice.featurebase.app/>
- Add VoiceGeneration component in home page with Play button
- Add a Share page for individual generated audio files
- Implement `fakefilter` to block disposable or temporary email address registrations <https://github.com/7c/fakefilter>
---
- Deploy model
  - FR: pierre, amelie, marie
    chuckle, cough, gasp, groan, laugh, sigh, sniffle, whimper, yawn
- Deploy model
  - DE: jana, thomas, max
    chuckle, cough, gasp, groan, laugh, sigh, sniffle, yawn
- Korean: 유나, 준서
- Mandarin: 长乐, 白芷

Ciao, mi chiamo Pietro, <laugh> , e sono un modello di generazione vocale che può sembrare una persona.

Ciao, mi chiamo Giulia, <gemito> , e sono un modello di generazione vocale che può sembrare una persona.

Ciao, mi chiamo Carlo, <gasp> , e sono un modello di generazione vocale che può sembrare una persona.

> sigh, laugh, cough, sniffle, groan, yawn, gemito, gasp

## SEO

- sitemap
- show more info on the side of the signup page. see <https://ui.shadcn.com/blocks/authentication>
- Page to compare with other TTS services
  - Google HD voice: https://cloud.google.com/text-to-speech?hl=en - doesn't support Speech Synthesis Markup Language (SSML) - price: free up to 1 million characters/month , US$30 per 1 million characters (Chirp 3: HD voices)
  - ElevenLabs

## Analytics

- add Posthog on Login and Signup pages

## Features

- Demo pre-cloned voices
- Upload pdf to convert to audio. Long-form context requires splitting into chunks. <https://github.com/Saganaki22/OrpheusTTS-WebUI/blob/b807264412b93f55404d2b50dc0ba8f384585828/orpheus.py#L150>
<https://github.com/isaiahbjork/orpheus-tts-local/pull/23/files>
- History page. Add button to regenerate audio -> navigate to /generate page with text_content prefilled

## Tests

- Setup Playwright for end-to-end testing.
- Uses a test DB (in memory)
- Setup Github actions

## AI server

- Monitor Replicate API calls. Which user is making more calls.

## Security

- Implement rate limiting to prevent abuse.
- Block temporary email addresses.
- Add Cloudflare Captcha protection.

## Maintenance

- add Global error handling <https://nextjs.org/docs/app/api-reference/file-conventions/error>
- Sentry monitoring with Posthog error linking <https://posthog.com/docs/libraries/node#sentry-integration>

##  Job scheduler

- upstash QStash - https://upstash.com/docs/qstash/quickstarts/vercel-nextjs
