import { describe, expect, it } from 'vitest';

import { CallAccounting } from '../src/call-accounting.ts';

describe('shadow call accounting', () => {
  // Match SexyCall's integer-second clock and cumulative 30-second buckets.
  it.each([
    [9999.9, 0],
    [10_000, 500],
    [30_999, 500],
    [31_000, 1000],
    [60_000, 1000],
    [61_000, 1500],
    [300_000, 5000],
  ])('projects %i ms as %i credits', (elapsedMs, credits) => {
    let now = 90_000;
    const call = new CallAccounting(() => now);
    call.start();
    now += elapsedMs - 1;
    call.markSpeaking();
    now += 1;
    call.stop('user_disconnect');
    expect(call.finalize()?.projectedCredits).toBe(credits);
  });

  it('keeps silent calls free and freezes the first outcome before teardown', () => {
    let now = 0;
    const call = new CallAccounting(() => now);
    call.start();
    now = 300_000;
    call.stop('duration_limit');
    now += 5000;
    call.markSpeaking();
    call.stop('user_disconnect');
    expect(call.finalize()).toMatchObject({
      elapsedMs: 300_000,
      endReason: 'duration_limit',
      projectedCredits: 0,
    });
    expect(call.finalize()).toBeUndefined();
  });

  it('does not report a call that never started', () => {
    const call = new CallAccounting(() => 0);
    call.stop('user_disconnect');
    expect(call.finalize()).toBeUndefined();
  });

  it('prices only observed usage and keeps missing readings explicit', () => {
    const call = new CallAccounting(() => 0);
    call.start();
    call.startReply()({
      promptTokens: 1000,
      promptCachedTokens: 400,
      completionTokens: 100,
    });
    call.startReply();
    call.recordTranscription(5000);
    call.recordTranscription(13_000);
    call.recordSynthesis(500);
    const report = call.finalize();
    expect(report?.provider).toEqual({
      stt: { audioDurationMs: 18_000, estimatedUsd: 0.001 },
      llm: {
        uncachedInputTokens: 600,
        cachedInputTokens: 400,
        outputTokens: 100,
        unreportedReplies: 1,
        reportedUsd: 0.001_08,
      },
      tts: { charactersCount: 500, estimatedUsd: 0.0125 },
    });
  });

  it('leaves absent provider readings null and treats invalid cached counts as unreported', () => {
    const call = new CallAccounting(() => 0);
    call.start();
    call.startReply()({
      promptTokens: 8,
      promptCachedTokens: 9,
      completionTokens: 2,
    });
    expect(call.finalize()?.provider).toEqual({
      stt: null,
      llm: {
        uncachedInputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
        unreportedReplies: 1,
        reportedUsd: null,
      },
      tts: null,
    });
  });

  it('only counts one usage report per Grok request', () => {
    const call = new CallAccounting(() => 0);
    call.start();
    const reportUsage = call.startReply();
    const usage = {
      promptTokens: 8,
      promptCachedTokens: 0,
      completionTokens: 2,
    };
    reportUsage(usage);
    reportUsage(usage);
    expect(call.finalize()?.provider.llm).toMatchObject({
      uncachedInputTokens: 8,
      outputTokens: 2,
      unreportedReplies: 0,
    });
  });

  it('uses the long-context Grok rate for all tokens on a qualifying request', () => {
    const call = new CallAccounting(() => 0);
    call.start();
    call.startReply()({
      promptTokens: 200_000,
      promptCachedTokens: 50_000,
      completionTokens: 100,
    });
    expect(call.finalize()?.provider.llm.reportedUsd).toBe(0.3955);
  });
});
