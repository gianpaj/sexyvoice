# Pinned TanStack live transcription sources

Source: [TanStack AI PR #1964](https://github.com/TanStack/ai/pull/1964),
commit `4725e44c97d5b562bf69019411245ff1ebf47f1a`. The PR is open as of
2026-11-16. These files are MIT licensed; retain [LICENSE](LICENSE).

| Local file | Source at that commit                                      |
| ---------- | ---------------------------------------------------------- |
| adapter.ts | packages/ai/src/activities/transcriptionSession/adapter.ts |
| audio.ts   | packages/ai/src/activities/transcriptionSession/audio.ts   |
| session.ts | packages/ai/src/activities/transcriptionSession/index.ts   |
| socket.ts  | packages/ai/src/activities/transcriptionSession/socket.ts  |
| grok.ts    | packages/ai-grok/src/adapters/live-transcription.ts        |

Local changes replace package-internal imports with relative imports, use Node
Buffer for the two base64 helpers, and read XAI_API_KEY locally. This copy is
server-only. The upstream source retains its formatting and is excluded from
Biome edits, but remains type-checked and covered by lifecycle/adapter tests.

Keep this dependency isolated to the internal voice spike. Replace the copy
with published APIs after the PR lands and its contracts pass these tests.
No production voice path imports these files.
