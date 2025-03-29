# TODO

- /generate-voice should be POST request
- Stripe subscription adds credits!
- Add Terms and Conditions
- Add Privacy Policy
- Add a Share page for individual generated audio files
- Add Blog

## Features

- See list of generated `audio_files`
- Clone voice
- Try pre-cloned voices
- Upload pdf to convert to audio. Long-form context requires splitting into chunks. <https://github.com/Saganaki22/OrpheusTTS-WebUI/blob/b807264412b93f55404d2b50dc0ba8f384585828/orpheus.py#L150>

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
- Sentry monitoring
