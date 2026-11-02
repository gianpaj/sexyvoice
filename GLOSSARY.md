# SexyVoice.ai

SexyVoice.ai turns text into speech, generates speech from voice samples, and
hosts live conversations with AI characters. All three are available in the
dashboard; the external API supports speech generation.

## Language

### Voices and generated audio

**Speech generation**:
Turning text into spoken audio, also called voice generation in marketing copy.
_Avoid_: Voice creation when referring to generated audio

**Voice**:
A specific speaking identity selected for speech generation or AI calls.
It determines who the speech sounds like, independently of a character's
personality.
_Avoid_: Speaker, character, generated audio

**Voice model**:
The speech synthesis model used to produce audio in a voice. Voices with the
same name on different models are separate catalog choices.
_Avoid_: Voice, provider

**Public voice**:
A catalog voice available to users for speech generation or calls. Public
availability of a voice does not make the audio generated with it public.
_Avoid_: Public audio, public character

**Generated audio**:
The speech audio produced from a user's text, using a catalog voice, a saved
voice, or reference audio. It is separate from the voice used to generate it.
_Avoid_: Generated voice, voice, recording

**Voice cloning**:
Reproducing the speaking identity in reference audio. Users can generate audio
directly from a recording or save a voice to reuse for speech generation and calls.
_Avoid_: Voice training, character creation

**Saved voice**:
A private, named cloned voice that its owner can reuse for speech generation
and assign to characters for calls. Saving a voice does not create a character.
_Avoid_: Character, generated audio, trained model

**Reference audio**:
A recording of the speaker whose voice a cloning request should imitate or save.
_Avoid_: Generated audio, voice preview

**Reference audio enhancement**:
Optional cleanup of reference audio before cloning. Cleanup for direct speech
generation can charge credits; noise removal when saving a voice is free.
_Avoid_: Text improvement, voice cloning

**Speech style**:
Directions about the delivery of generated speech, such as its tone or emotion.
Speech style is separate from the voice identity and the words to be spoken.
_Avoid_: Character instructions, scene

**Emotion tag**:
An inline cue in speech input for expression, pauses, or nonverbal sounds.
Supported tags depend on the selected voice model.
_Avoid_: Speech style, spoken text

### Voice calls

**Character**:
A saved combination of a prompt and a voice for an AI call persona. The prompt
defines personality and behavior; the voice determines how the character sounds.
_Avoid_: Call preset, preset, voice

**Predefined character**:
A character supplied by SexyVoice.ai and available to users. Users cannot
edit its personality instructions.
_Avoid_: Public character, default preset

**Custom character**:
A private character created and managed by its owner, available to paid users.
_Avoid_: Custom voice, cloned voice, custom preset

**Call session**:
One live voice conversation between a user and the AI, with its own duration,
status, credit usage, and available transcript.
_Avoid_: Character, saved call settings

**Scene**:
An optional situation and behavioral directions added to a call's conversation
instructions. A scene applies to the call and is separate from the saved
character.
_Avoid_: Character, character instructions

**Call transcript**:
A text record of the available speech from a call's participants. It may
contain only the AI's turns.
_Avoid_: Call analysis, memory, complete recording

**Call analysis**:
A structured assessment of a call transcript, including its topic, engagement,
sentiment, conversation quality, and response issues.
_Avoid_: Call transcript, memory, call summary

**Memory**:
Facts about a user retained across voice calls to support later conversations.
Memory belongs to the user across characters and is separate from a call's
transcript or analysis.
_Avoid_: Character memory, call transcript, call analysis

### Credits and billing

**Credit**:
The unit a user spends on speech generation, voice cloning, and live calls.
Credit charges and the platform's provider costs are separate amounts.
_Avoid_: Token, dollar, minute

**Credit balance**:
The credits a user has available to spend, shared by dashboard and external API
usage.
_Avoid_: API balance, subscription balance, total purchased credits

**Credit reservation**:
An estimated generation charge deducted before work begins. The final charge
is reconciled against it, and a failed generation releases the reservation.
_Avoid_: Final charge, payment authorization

**Top-up**:
A one-time purchase that adds credits to a user's balance.
_Avoid_: Subscription, renewal

**Subscription**:
A recurring monthly credit purchase that adds credits to the user's balance
when each payment succeeds.
_Avoid_: Top-up, paid status

**Paid user**:
A user with at least one recorded credit purchase, through a top-up or a
subscription payment. Paid status does not require an active subscription or
a positive credit balance.
_Avoid_: Subscriber, active subscriber, premium user

**Free user**:
A user without a recorded credit purchase, even if they have free credits
available.
_Avoid_: User with no credits, canceled subscriber

**Credit transaction**:
A record of credits granted or returned to a user, including free allocations,
paid purchases, and credit refunds. Spending on an activity belongs to its
usage event.
_Avoid_: Usage event, generation charge

**Usage event**:
A metering record for speech generation, voice cloning, reference audio
enhancement, or a live call, including the credits consumed and available
provider cost information.
_Avoid_: Credit transaction, payment

**Provider cost**:
The platform's recorded or estimated expense for an AI service's work. It is
separate from the credits charged to the user.
_Avoid_: Credit charge, revenue, purchase price

### Product access

**Dashboard**:
The signed-in web interface for speech generation, voice cloning, calls, and
account management.
_Avoid_: External API, public tools

**External API**:
The interface for third-party applications to generate speech using a user's
API key and credit balance. Each speech request generates fresh audio.
_Avoid_: Dashboard API, separate API account
