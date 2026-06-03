# Claude Notes

- Transactional emails are queued through Inngest and sent with Resend.
- Required env for this flow: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, and `INNGEST_BASE_URL` when the environment needs an explicit callback base URL.
- Configure Resend delivery webhooks directly in Inngest using the official guide: https://www.inngest.com/docs/guides/resend-webhook-events
- Registration success emails must fire only after `/auth/callback` completes the signup flow.
- The first-generation email covers the first successful dashboard generation, clone, or `/api/v1/speech` generation for a user.
- User locale preference is persisted in `profiles.locale` and saving it from Profile should navigate the user to the selected locale URL.
