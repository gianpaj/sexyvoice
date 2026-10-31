# SexyVoice.ai auth.md

This document is for AI agents that use the SexyVoice API on behalf of a user.
The API base URL is `https://sexyvoice.ai/api/v1`.

## Registration and credential provisioning

Supported method: human-assisted account registration and API-key provisioning.
Credentials are API keys issued to a user's paid account.

1. Ask the user to [create an account](https://sexyvoice.ai/en/signup) or sign in.
2. The account must have a subscription or credit top-up to create API keys.
3. Ask the user to open [Dashboard → API Keys](https://sexyvoice.ai/en/dashboard/api-keys)
   and create a named key for the agent. Each account can have up to 10 active keys.
4. Have the user provide the key through a secure secret store. The full key is
   shown only when it is created.

The dashboard provisions credentials with `POST https://sexyvoice.ai/api/api-keys`.
This endpoint requires the user's authenticated browser session cookies and
`Content-Type: application/json`. An API key cannot authenticate this request.
The JSON body contains a required `name` (1–100 characters) and an optional
`expires_at` (an ISO 8601 datetime or `null`). For example:

```json
{
  "name": "My agent"
}
```

A successful request returns HTTP 201 with `key` (the full API key) and `data`
(key metadata, including its `id`). HTTP 401 means a signed-in session is required;
HTTP 403 means the account needs a subscription or top-up.

The external API does not offer OAuth token issuance, ID-JAG registration,
verified-email assertions, or anonymous agent registration. Use the dashboard
provisioning flow above.

## Use credentials

Send the API key in the `Authorization` header over HTTPS:

```http
GET /api/v1/models HTTP/1.1
Host: sexyvoice.ai
Authorization: Bearer <SEXYVOICE_API_KEY>
```

Use the key for `GET /api/v1/models`, `GET /api/v1/voices`,
`GET /api/v1/billing`, and `POST /api/v1/speech`. Speech generation consumes
the account's credits. Keep keys out of URLs, public client code, and logs.

HTTP 401 means the credential is missing, invalid, expired, or revoked. Ask the
user to provision a replacement. HTTP 429 means the request was rate-limited;
respect `Retry-After` when present.

## Revoke or replace credentials

The user can revoke a key in Dashboard → API Keys. The dashboard sends
`DELETE https://sexyvoice.ai/api/api-keys/{id}` using the user's authenticated
browser session, where `{id}` is the key's metadata ID. A successful revocation
returns HTTP 200 with `{"success": true}`. To replace a key, create a new key,
update the agent's secret store, and revoke the old key.

## Public API documentation

- [OpenAPI schema](https://sexyvoice.ai/api/v1/openapi) (no credentials required)
- [API quickstart](https://docs.sexyvoice.ai/guides/api)

Discovery is read-only. Fetch this document and the public OpenAPI schema to
inspect support; do not submit registration or provisioning requests as a probe.
