# TODO

- Stripe subscription adds credits!
- Add Status page link on dashboard footer.
- Add VoiceGeneration component in home page with Play button
- Show examples of different public voices
- Link in footer to FeatureBase <https://sexyvoice.featurebase.app/>
- Add Terms and Conditions
- Add Privacy Policy
- Add a Share page for individual generated audio files
- Add Blog

## SEO

- sitemap
- show more info on the side of the signup page. see <https://ui.shadcn.com/blocks/authentication>

## Analytics

- add Posthog on Login and Signup pages

## Features

- Clone voice
- Try pre-cloned voices
- Upload pdf to convert to audio. Long-form context requires splitting into chunks. <https://github.com/Saganaki22/OrpheusTTS-WebUI/blob/b807264412b93f55404d2b50dc0ba8f384585828/orpheus.py#L150>
<https://github.com/isaiahbjork/orpheus-tts-local/pull/23/files>
- History page. Add button to regenerate audio -> navigate to /generate page with text_content prefilled

## Tests

- Setup Playwright for end-to-end testing.
- Uses a test DB (in memory)
- Setup Github actions

## AI server

- Monitor Replicate API calls. Which user is making more calls.
- delete file after generated

## Security

- Verify User email address
- Implement rate limiting to prevent abuse.
- Block temporary email addresses.
- Add Cloudflare Captcha protection.

## Maintenance

- add Global error handling <https://nextjs.org/docs/app/api-reference/file-conventions/error>
- Sentry monitoring with Posthog error linking <https://posthog.com/docs/libraries/node#sentry-integration>
