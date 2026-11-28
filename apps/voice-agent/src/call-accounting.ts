import type { llm } from '@livekit/agents';

const CREDITS_PER_BUCKET = 500;
const BUCKET_SECONDS = 30;
const MINIMUM_BILLABLE_SECONDS = 10;
const LONG_CONTEXT_TOKENS = 200_000;

type EndReason =
  | 'user_disconnect'
  | 'duration_limit'
  | 'provider_failure'
  | 'history_failure'
  | 'session_closed'
  | 'worker_shutdown';

type ReplyTokens = Pick<
  llm.CompletionUsage,
  'promptTokens' | 'promptCachedTokens' | 'completionTokens'
>;

export type TrackReply = () => (usage: ReplyTokens) => void;

function roundUsd(amount: number) {
  return Math.round(amount * 1_000_000) / 1_000_000;
}

// Shadow estimates for the pinned cascade. Provider readings can omit usage
// from failed or interrupted streams, so they are reported separately.
export class CallAccounting {
  private readonly now: () => number;
  private startedAt?: number;
  private ended?: { elapsedMs: number; reason: EndReason };
  private spoke = false;
  private finalized = false;
  private sttAudioMs?: number;
  private ttsCharacters?: number;
  private uncachedInputTokens = 0;
  private cachedInputTokens = 0;
  private outputTokens = 0;
  private unreportedReplies = 0;
  private grokUsd?: number;

  constructor(now = () => performance.now()) {
    this.now = now;
  }

  start() {
    this.startedAt ??= this.now();
  }

  markSpeaking() {
    if (!this.ended) this.spoke = true;
  }

  stop(reason: EndReason) {
    if (this.startedAt === undefined || this.ended) return;
    this.ended = { reason, elapsedMs: this.now() - this.startedAt };
  }

  recordTranscription(audioDurationMs: number) {
    this.sttAudioMs = (this.sttAudioMs ?? 0) + audioDurationMs;
  }

  recordSynthesis(charactersCount: number) {
    this.ttsCharacters = (this.ttsCharacters ?? 0) + charactersCount;
  }

  startReply(): ReturnType<TrackReply> {
    this.unreportedReplies++;
    let reported = false;
    return ({ promptTokens, promptCachedTokens, completionTokens }) => {
      if (
        reported ||
        ![promptTokens, promptCachedTokens, completionTokens].every(
          (count) => Number.isSafeInteger(count) && count >= 0,
        ) ||
        promptCachedTokens > promptTokens
      )
        return;

      reported = true;
      this.unreportedReplies--;
      const uncached = promptTokens - promptCachedTokens;
      const longContextMultiplier = promptTokens >= LONG_CONTEXT_TOKENS ? 2 : 1;
      this.uncachedInputTokens += uncached;
      this.cachedInputTokens += promptCachedTokens;
      this.outputTokens += completionTokens;
      this.grokUsd =
        (this.grokUsd ?? 0) +
        (longContextMultiplier *
          (1.25 * uncached +
            0.2 * promptCachedTokens +
            2.5 * completionTokens)) /
          1_000_000;
    };
  }

  finalize() {
    if (this.finalized) return;
    this.stop('worker_shutdown');
    if (!this.ended) return;
    this.finalized = true;

    const elapsedMs = Math.floor(this.ended.elapsedMs);
    const seconds = Math.floor(elapsedMs / 1000);
    const buckets =
      this.spoke && seconds >= MINIMUM_BILLABLE_SECONDS
        ? Math.ceil(seconds / BUCKET_SECONDS)
        : 0;
    return {
      elapsedMs,
      endReason: this.ended.reason,
      agentSpoke: this.spoke,
      projectedMinutes: (buckets * BUCKET_SECONDS) / 60,
      projectedCredits: buckets * CREDITS_PER_BUCKET,
      provider: {
        stt:
          this.sttAudioMs === undefined
            ? null
            : {
                audioDurationMs: this.sttAudioMs,
                estimatedUsd: roundUsd((this.sttAudioMs * 0.2) / 3_600_000),
              },
        llm: {
          uncachedInputTokens: this.uncachedInputTokens,
          cachedInputTokens: this.cachedInputTokens,
          outputTokens: this.outputTokens,
          unreportedReplies: this.unreportedReplies,
          reportedUsd:
            this.grokUsd === undefined ? null : roundUsd(this.grokUsd),
        },
        tts:
          this.ttsCharacters === undefined
            ? null
            : {
                charactersCount: this.ttsCharacters,
                estimatedUsd: roundUsd((this.ttsCharacters * 25) / 1_000_000),
              },
      },
    };
  }
}
