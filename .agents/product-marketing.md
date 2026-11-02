# Product Marketing Context

**Document version:** v5
**Last updated:** 2026-08-01

> Shared positioning context, written to the canonical path the external
> product-marketing skill toolchain looks for. No skill checked into this repo
> reads it today — it's a convention for external/global marketing tooling, so
> treat it as a hand-maintained source of truth rather than something wired up
> here.
>
> Items marked **[unverified]** are not backed by published site copy, docs, or
> terms — confirm before using them in customer-facing material.

## Product Overview

**One-liner:** Expressive AI voices — generate, clone, and talk to them live, in 70+ languages.
**What it does:** SexyVoice.ai turns text into natural, emotion-rich speech, clones a voice from as little as 10 seconds of audio, and runs real-time voice conversations with AI characters. All three are available in the web app. The developer API and CLI cover **speech generation only** — see "What the API actually covers" below.

**Product category:** AI voice platform — text-to-speech, voice cloning, and real-time conversational voice
**Product type:** SaaS (web app + external REST API), freemium, credit-based consumption
**Business model:** Free tier (10,000 credits, no card required) → one-time top-ups (Starter $5/10k, Standard $10/25k, Pro $75/300k) → subscriptions at the same price points with a 15% credit bonus. Pro is 37.5% cheaper per credit than Standard. No contracts.

**What the API actually covers.** Never imply the full product is available
programmatically. The public v1 surface is `/speech`, `/voices`, `/models`,
`/billing`, and `/openapi`; the CLI wraps login, voice listing, and `tts`.

| Capability                             | Web app | API / CLI                                     |
| -------------------------------------- | ------- | --------------------------------------------- |
| Speech generation                      | ✅      | ✅                                            |
| Voice + model listing, billing balance | ✅      | ✅                                            |
| Voice cloning (creating a clone)       | ✅      | ❌                                            |
| Using a cloned/private voice           | ✅      | ❌ — `/voices` serves `is_public` voices only |
| Live AI calling                        | ✅      | ❌                                            |

## Target Audience

**Target companies:** Primarily self-serve individuals and small teams — creator businesses, indie game and app studios, e-learning and localization shops. Developer/API customers skew toward small product teams embedding voice rather than enterprise procurement.
**Decision-makers:** Self-serve. The user is the buyer. For API customers, the developer is both evaluator and purchaser.
**Primary use case:** Produce natural, expressive voice audio at scale without recording sessions, voice actors, or a studio.
**Jobs to be done:**

- Narrate content (videos, podcasts, audiobooks, social) without recording myself
- Clone a voice once and reuse it across languages and projects
- Add a talking voice to my product without building speech infrastructure

**Use cases:** Podcast and video narration, audiobook production, dubbing and localization, game and NPC character voices, e-learning narration, accessibility/personalized voice, real-time AI companions and assistants, voice features embedded via API.

## Personas

Mostly a self-serve consumer/prosumer product, so these are buyer _types_, not a B2B buying committee.

| Persona                             | Cares about                                   | Challenge                                               | Value we promise                                                       |
| ----------------------------------- | --------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------- |
| Content Creator                     | Consistent, professional-grade audio at scale | Recording and re-recording eats the production schedule | Emotion-rich generation in minutes, reusable cloned voices             |
| Storyteller / Character Creator     | Voices that act, not just read                | Standard TTS is flat and kills immersion                | Emotion tags, style prompting, per-character voices, live calling      |
| Localization / Multilingual Creator | Reaching audiences in their own language      | Voice talent per language is expensive and slow         | One cloned voice across 23 cloning languages; 70+ generation languages |
| Developer / Indie Studio            | API quality, docs, predictable cost           | Building or stitching speech infra is a distraction     | Live REST API, CLI, OpenAPI docs, per-request credit billing           |
| Hobbyist                            | Trying AI voice cheaply                       | Upfront cost and complexity of other tools              | 10,000 free credits, no credit card, free browser-based audio tools    |

**Anti-persona:** Buyers who need enterprise procurement, contractual uptime SLAs, or on-prem/self-hosted deployment. Also anyone wanting to impersonate a real person — we don't want that use case, though see the note under Objections: our published terms don't currently forbid it in so many words.

## Problems & Pain Points

**Core problem:** Most text-to-speech still sounds like it's reading, not speaking. Creators need audio that carries emotion and timing, in more than one language, without booking a voice actor or re-recording every edit.
**Why alternatives fall short:**

- Basic TTS reads text literally — no emotional or contextual understanding, so output sounds robotic
- Generation, cloning, and real-time conversation usually mean three separate tools and three bills
- Multilingual coverage drops off sharply outside English
- Recording yourself or hiring talent doesn't scale to frequent edits and doesn't localize

**What it costs them:** Hours per episode in recording and retakes, per-language voice talent costs, delayed launches, inconsistent audio across a back catalog.
**Emotional tension:** Frustration with flat output, self-consciousness about their own recorded voice, worry that AI audio will sound cheap and undercut their brand, uncertainty about what their voice data is used for.

## Competitive Landscape

**Direct:** ElevenLabs — the quality benchmark, strongest in English, priced above us. Murf AI — polished for business/corporate narration, heavier filtering, weaker on character work. Fish Audio, PlayHT, Kukarella — overlapping cloning and multi-language feature sets; differentiation is quality, breadth, and price rather than category.
**Secondary:** Google Cloud TTS, Azure Speech, OpenAI TTS — cheap and reliable APIs, but raw infrastructure with no cloning workflow, no creator UI, and no live conversational layer.
**Indirect:** Recording yourself or hiring a voice actor — highest quality ceiling, but expensive, slow to revise, and impossible to localize cheaply.

> **[unverified]** Competitor content policies, pricing, and language counts were not
> re-checked for this revision. Verify before citing any competitor claim publicly.

## Differentiation

**Key differentiators:**

- Expressive by default — models interpret emotional and logical context; emotion tags for laughter, sighs, coughs; style prompting ("British accent," "seductive tone")
- Three modes in one platform and one credit balance: generation, cloning, and live real-time calling
- Language breadth — coverage depends on the feature, and speech generation goes widest: 70+ languages on Gemini 3.1, 24 on Gemini 2.5, fewer on other voice models. Cloning covers 23 languages. See the coverage table under Proof Points before quoting a number.
- Model choice under one API — Google Gemini (2.5 and 3.1 Flash), xAI Grok, and Replicate/Orpheus
- Real developer surface — REST API v1, API keys, CLI login, usage/billing dashboards, OpenAPI-generated docs at docs.sexyvoice.ai
- Transparent credit pricing published on the site; free tier with no card
- Free browser-based audio tools (transcription, conversion, joining) that run offline with no upload
- Fewer content restrictions than mainstream corporate TTS platforms **[unverified — no adult/NSFW policy appears in our published terms; do not promise this until terms say so]**

**How we do it differently:** One platform and one credit balance across pre-generated speech, cloned voices, and live conversation — instead of assembling a TTS vendor, a cloning vendor, and a realtime voice stack. (One _platform_, not one API: the API itself is speech-generation only.)
**Why that's better:** Less integration work, one bill, and consistent voice identity across every format a creator ships.
**Why customers choose us:** Voices that perform rather than recite, language coverage that survives localization, a genuinely usable API, and pricing you can calculate before you buy.

## Objections

| Objection                                                          | Response                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Will it actually sound natural, or robotic like everything else?" | The models interpret context, not just characters — tone, pacing, and expression. Emotion tags and style prompting are built in. Try it free before paying.                                                                                                                                                                |
| "Is my voice data safe?"                                           | Recordings and generated files are encrypted. Cloning samples are deleted after the voice is built. You can delete generated audio any time. We never share voice data without consent.                                                                                                                                    |
| "I don't know if I'll use enough to justify paying."               | 10,000 free credits, no credit card. ~1,000 credits ≈ 1 minute of generation as a rule of thumb, and live calling is 1,000 credits/minute — so you can do the math before you spend. (Check the burn-rate table under Proof Points before quoting this to a cloning-led audience; cloned voices cost far more per minute.) |
| "Do I have to rebuild if I need an API later?"                     | The speech-generation API is live today — keys, CLI, OpenAPI docs — and runs on the same credits as the dashboard. Cloning and live calling are web-app only for now, so don't promise those programmatically.                                                                                                             |
| "Can I use this commercially?"                                     | Yes — you own the audio you generate, including via the API, and may distribute and commercially exploit it (`policies/terms.mdx`, "Ownership and Use of Generated Content"). That grant does not extend to any voice, likeness, or content you aren't authorised to use.                                                  |

> **[unverified] — acceptable-use claims.** Don't state that "our terms prohibit
> deception or impersonation." The published terms don't. Their `Restrictions`
> section covers only reselling, reverse engineering, and proprietary notices,
> and the generated-content clause merely withholds the ownership grant for a
> voice or likeness you aren't authorised to use — which is not a prohibition on
> the conduct. Note that the live site FAQ already makes this claim
> (`messages/*.json`, "What can I use the generated voices for?"), so the gap is
> in customer-facing copy today, not just in this document. Either add an
> acceptable-use clause to the terms or soften the FAQ; until then, don't build
> new copy on it.

## Switching Dynamics

**Push:** Flat, robotic output that undercuts production value; per-minute costs that scale badly; language gaps that block localization; juggling separate tools for generation, cloning, and realtime voice.
**Pull:** Emotion-rich output; live calling; 70+ languages; a free tier with no card; an API and CLI that work today; published credit math.
**Habit:** Existing voice libraries and prompt workflows on incumbents; scripts already wired to another vendor's API; the muscle memory of just recording it themselves.
**Anxiety:** "Will quality match what I'm used to?" · "Will my cloned voice actually sound like me?" · "Is a smaller platform going to be around and stable?" · "What happens to my voice sample?"

## Customer Language

**How they describe the problem:**

- "It sounds like a robot reading a script"
- "I don't want to re-record the whole episode for one line"
- "There's no good voice for [language] anywhere"
- "I hate the sound of my own voice"

**How they describe us:**

- "The voice sounds incredibly natural"
- "It actually sounds like it's acting"
- "I cloned my voice in ten seconds and it speaks Italian"

> Verbatim quotes above are drawn from positioning work, not from logged customer
> interviews. Replace with real quotes as interviews and reviews come in.

**Words to use:** expressive, emotion-rich, natural, human-like, lifelike, clone, live, real-time, multilingual, instant, free credits, fair pricing, no contracts
**Words to avoid:** synthetic, fake, robotic (except when describing competitors), text-to-speech engine, monitored, contract, enterprise-grade (unless backed)
**Glossary:**

| Term                   | Meaning                                                                    |
| ---------------------- | -------------------------------------------------------------------------- |
| Credits                | Usage unit for all paid features (~1,000 ≈ 1 minute of generation)         |
| Voice cloning          | Building a reusable voice model from a sample as short as 10 seconds       |
| Live calling           | Real-time two-way AI voice conversation, billed at 1,000 credits/minute    |
| Emotion tags           | Inline markup that triggers laughter, sighs, coughs, and similar in output |
| Cross-language cloning | One cloned voice generating speech across 23 supported languages           |
| `gpro` / `gpro31`      | Gemini 2.5 and Gemini 3.1 Flash voice models                               |
| Top-up vs subscription | One-time credit purchase vs recurring purchase with a 15% credit bonus     |

## Brand Voice

**Tone:** Warm, playful, confident, non-judgmental
**Style:** Casual and direct; plain language over corporate speak; emoji-friendly in product copy; concrete numbers over adjectives
**Personality:** Expressive, inclusive, transparent, tech-forward, unpretentious

## Proof Points

**Metrics:**

- 10,000 free credits ≈ 10 minutes of speech at the published ~1,000 credits/minute rule of thumb, no card required. Actual burn rate varies a lot by voice and model — see the table below before quoting a duration.
- Live calls cost 1,000 credits/minute
- Live calling on the free tier stops after **5 minutes total across all calls ever made** (`FREE_USER_CALL_LIMIT_SECONDS`) — a cumulative allowance, not a per-call cap. It lifts permanently on the user's first purchase or top-up (`isFreeUserOverCallLimit` → `hasUserPaid`). The in-product string says it correctly: "Free users are limited to 5 minutes of calls."
- Pro is 37.5% cheaper per credit than Standard; subscriptions add 15% more credits
- Voice cloning from as little as 10 seconds of audio
- Site available in 6 languages: EN, ES, DE, DA, IT, FR

**Credit burn rate is model-dependent.** Non-Grok generation bills
`seconds × 10 × multiplier`, so credits/minute is `600 × multiplier`
(`apps/web/lib/utils.ts`). The published "~1,000 credits ≈ 1 minute" is a rough
average, not a rate any single voice charges. A cloned voice burns **10× what a
Gemini voice does**, so never quote a free-tier duration to a cloning-led
audience without qualifying it.

| Voice / model                                                        | Credits per minute | 10,000 free credits ≈ |
| -------------------------------------------------------------------- | ------------------ | --------------------- |
| Gemini `gpro` (any user), or `gpro31` for paid users (×1.1)          | ~660               | ~15 min               |
| Gemini `gpro31` for free users (×2.2 — 2× surcharge)                 | ~1,320             | ~7.5 min              |
| Grok voices (~1 credit/character)                                    | ~1,000             | ~10 min               |
| Default / other voices (×4)                                          | ~2,400             | ~4 min                |
| Named IT/ES voices — pietro, giulia, carlo, javi, sergio, maria (×8) | ~4,800             | ~2 min                |
| Cloned voice (×11)                                                   | ~6,600             | ~1.5 min              |

> **Site copy bug.** The public FAQ says both "About 1,000 credits make 1 minute"
> and "10,000 free credits (about 5 minutes of speech)" in the same answer —
> those two can't both hold. Per product decision the correct headline figure is
> **10 minutes**; the FAQ needs fixing to match.

**Language coverage by feature.** There is no single platform-wide language
number — always scope the claim to the feature, and to the voice/model where it
varies. Speech generation is the widest, and Gemini goes furthest.

| Feature                                          | Languages        | Notes                                                                                                                                                 |
| ------------------------------------------------ | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Speech generation — Gemini 3.1 (`gpro31`)        | 70+              | Our widest coverage; the number to use when leading on language breadth                                                                               |
| Speech generation — Gemini 2.5 (`gpro`)          | 24               | Default model                                                                                                                                         |
| Speech generation — other voices (Grok, Orpheus) | Varies, narrower | Several are single-language; check the voice before quoting                                                                                           |
| Voice cloning                                    | 23               | One cloned voice reused across all of them                                                                                                            |
| Transcription (Whisper)                          | **[unverified]** | Page meta says "99+ languages"; the on-page FAQ says the multilingual Whisper models support 32. Pick one and fix the site copy before citing either. |

**Customers:** "Join thousands of creators who trust our platform" — **[unverified]** no supporting figure found in the repo; substantiate or stop using.
**Testimonials:** None captured yet. Highest-value gap in this document — collect 3–5 with names and use cases.
**Value themes:**

| Theme              | Proof                                                                                                                |
| ------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Expressive quality | Context-aware models; emotion tags; style prompting; Gemini + Grok voice families                                    |
| Breadth            | Up to 70+ speech generation languages (Gemini 3.1); 23 cloning languages                                             |
| All-in-one         | Generation, cloning, and live calling in one web app on one credit balance                                           |
| Developer-ready    | Live speech-generation API v1, API keys, CLI, OpenAPI docs, usage and billing dashboards                             |
| Privacy            | Encrypted storage, cloning samples deleted after use, user-controlled deletion, offline browser tools with no upload |
| Fair pricing       | Published credit math, free tier without a card, no contracts                                                        |

## Goals

**Business goal:** Convert free users to paid, and grow the developer/API segment as a second revenue engine alongside self-serve creators.
**Conversion action:** Sign up free → generate or take a live call → buy a top-up or subscribe. Secondary: create an API key and ship a first API request.
**Current metrics:** Unknown — not tracked in this repo. Fill in signup→paid conversion, free-credit burn rate, and API activation rate.

## Changelog

_Newest first. One line per revision: what changed and why._

- v6 (2026-08-11) — Reverted the live-call rate from 1,000 to 1,100 credits/minute ($0.05) alongside the downgrade to the grok-voice-think-fast-1.0 voice model.
- v5 (2026-08-01) — Raised the live-call rate from 1,000 to 1,100 credits/minute ($0.55) alongside the upgrade to the grok-voice-think-fast-2.0 voice model. The "~1,000 credits ≈ 1 minute" rule of thumb is unchanged: it is about speech generation, not calls, and the two rates are no longer the same number.
- v4 (2026-07-25) — Fixed four claims flagged in review. Corrected the free-tier call limit, which v3 got backwards: it is a cumulative 5-minute total across all calls that lifts on first purchase, not a per-call cap. Scoped API positioning to speech generation only, with a capability table — cloning and live calling are web-app features and `/voices` serves public voices only. Withdrew the "our terms prohibit deception and impersonation" claim, which the published terms do not support, and flagged that the live FAQ already makes it. Added a model-dependent credit burn-rate table, since a cloned voice costs ~10× a Gemini voice and the "~1,000 credits/minute" figure is an average no single voice charges. Also corrected the header's claim that skills in this repo read the file.
- v3 (2026-07-25) — Corrected the free tier to ~10 minutes of speech (10,000 credits at ~1,000/min) and split out the 5-minute free-tier call limit that it was conflated with (mischaracterised as per-call; corrected in v4); replaced scattered per-feature language counts with a single "language coverage by feature" table in Proof Points, since coverage varies by feature and voice model (speech generation widest, Gemini furthest); standardised marketing copy on "languages" instead of "locales"; flagged transcription coverage as unverified because site meta says 99+ while the on-page FAQ says 32.
- v2 (2026-07-24) — Repositioned lead from "commercial adult content allowed" to expressive voices + live calling + multilingual + developer API, demoting content policy to a secondary, flagged-unverified point; corrected live-call rate to 1,000 credits/min, marked the API live, added Starter/subscription tiers, Grok and Gemini 3.1 models, 70+ language coverage, and the free browser audio tools; replaced the obsolete API-related anti-persona; migrated from the legacy `product-marketing-context.md` filename and added versioning.
- v1 (2026-02-21) — Initial context.
