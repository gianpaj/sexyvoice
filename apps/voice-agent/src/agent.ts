import { fileURLToPath } from 'node:url';
import { cli, defineAgent, log, ServerOptions, voice } from '@livekit/agents';
import { TTS } from '@livekit/agents-plugin-inworld';
import { VAD } from '@livekit/agents-plugin-silero';
import { STT } from '@livekit/agents-plugin-xai';
import { RoomEvent } from '@livekit/rtc-node';
import {
  AGENT_NAME,
  MAX_CALL_MS,
  MUTE_RPC,
  muteSchema,
  RUNTIME,
  RUNTIME_ATTRIBUTE,
} from '@sexyvoice/voice-spike';
import { replyInstructions } from '@sexyvoice/voice-spike/history';
import { loadMemory } from '@sexyvoice/voice-spike/memory';
import { createClient } from '@supabase/supabase-js';

import { CallAccounting } from './call-accounting.ts';
import { closeCall } from './call-cleanup.ts';
import { parseJob } from './config.ts';
import { CallMemoryAgent } from './memory.ts';
import { TanStackLLM } from './tanstack-llm.ts';
import { CallThread } from './thread.ts';

if (
  process.env.VOICE_SPIKE_ENABLED !== 'true' ||
  process.env.VERCEL_ENV === 'production'
) {
  throw new Error(
    'Set VOICE_SPIKE_ENABLED=true for the internal JS call worker',
  );
}
for (const key of [
  'LIVEKIT_URL',
  'LIVEKIT_API_KEY',
  'LIVEKIT_API_SECRET',
  'XAI_API_KEY',
  'INWORLD_API_KEY',
  'VOICE_SPIKE_USER_IDS',
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SECRET_KEY',
]) {
  if (!process.env[key]) throw new Error(`Missing ${key}`);
}

const databaseUrl = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
if (!['localhost', '127.0.0.1', '[::1]'].includes(databaseUrl.hostname)) {
  throw new Error('The JS spike worker requires a local Supabase database');
}
const db = createClient(databaseUrl.href, process.env.SUPABASE_SECRET_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
  global: {
    fetch: (request, init) =>
      fetch(request, {
        ...init,
        signal: init?.signal ?? AbortSignal.timeout(5000),
      }),
  },
});

export default defineAgent({
  prewarm: async (proc) => {
    proc.userData.vad = await VAD.load();
  },
  entry: async (ctx) => {
    const job = parseJob(ctx.job.metadata, process.env);
    await ctx.connect();
    let waiting: ReturnType<typeof setTimeout> | undefined;
    const participant = await Promise.race([
      ctx.waitForParticipant(`spike-user-${job.userId}`),
      new Promise<never>((_, reject) => {
        waiting = setTimeout(
          () => reject(new Error('Caller did not join')),
          30_000,
        );
      }),
    ]).finally(() => clearTimeout(waiting));
    const local = ctx.room.localParticipant!;
    const roomName = ctx.room.name;
    if (!roomName) throw new Error('Missing spike room name');
    const thread = new CallThread(db, {
      userId: job.userId,
      conversationId: job.conversationId,
      roomName,
    });
    const reportStorageError = () =>
      local
        .setAttributes({
          [RUNTIME_ATTRIBUTE]: RUNTIME,
          'sv.spike.error': 'history',
        })
        .catch(() => undefined);
    const opened = await thread.open(job.resume).catch(async () => {
      await reportStorageError();
      await thread.close();
      throw new Error('Voice spike history unavailable');
    });
    const memory = await loadMemory(db, job.userId, opened.thread.character_id);
    const agentOptions = {
      chatCtx: opened.chatCtx,
      instructions: replyInstructions(opened.thread, memory?.instructions).join(
        '\n',
      ),
    };
    const agent = memory?.recall
      ? new CallMemoryAgent(agentOptions, memory.recall)
      : new voice.Agent(agentOptions);
    const accounting = new CallAccounting();
    const stt = new STT({ model: 'grok-voice-transcribe-2.0', language: 'en' });
    stt.on('metrics_collected', (metric) => {
      accounting.recordTranscription(metric.audioDurationMs);
    });
    const tts = new TTS({
      model: 'inworld-tts-2',
      voice: job.inworldVoiceId ?? 'Ashley',
      deliveryMode: 'BALANCED',
    });
    tts.on('metrics_collected', (metric) => {
      accounting.recordSynthesis(metric.charactersCount);
    });
    const session = new voice.AgentSession({
      vad: ctx.proc.userData.vad as Awaited<ReturnType<typeof VAD.load>>,
      stt,
      llm: new TanStackLLM(job.conversationId, {
        trackReply: () => accounting.startReply(),
      }),
      tts,
      turnHandling: { turnDetection: 'stt', interruption: { mode: 'vad' } },
    });
    session.on(
      voice.AgentSessionEventTypes.AgentStateChanged,
      ({ newState }) => {
        if (newState === 'speaking') accounting.markSpeaking();
      },
    );
    // Input remains disabled until the browser has verified this runtime.
    session.input.setAudioEnabled(false);
    let cleanup: Promise<void> | undefined;
    const finalize = () => {
      const report = accounting.finalize();
      if (report)
        log().info({ roomName, ...report }, 'Voice spike shadow accounting');
      return thread.close();
    };
    const finish = (reason: Parameters<CallAccounting['stop']>[0]) => {
      accounting.stop(reason);
      clearTimeout(deadline);
      cleanup ??= closeCall({
        closeSession: () => session.close(),
        disconnect: () => ctx.room.disconnect(),
        flush: finalize,
        onCloseFailure: () =>
          log().warn(
            { roomName },
            'Voice spike session teardown did not finish',
          ),
      }).finally(() => ctx.deleteRoom(roomName));
      return cleanup;
    };
    const deadline = setTimeout(() => {
      finish('duration_limit').catch(() => ctx.shutdown('spike deadline'));
    }, MAX_CALL_MS);
    ctx.addShutdownCallback(() => {
      clearTimeout(deadline);
      // The SDK calls this after disconnecting, even when its own close times out.
      return finalize();
    });
    session.on(
      voice.AgentSessionEventTypes.ConversationItemAdded,
      ({ item }) => {
        thread.append(item, () => {
          reportStorageError().finally(() =>
            finish('history_failure').catch(() =>
              ctx.shutdown('history failure'),
            ),
          );
        });
      },
    );
    local.registerRpcMethod(MUTE_RPC, (request) => {
      if (request.callerIdentity !== participant.identity)
        throw new Error('Unexpected caller');
      const { muted } = muteSchema.parse(JSON.parse(request.payload));
      session.input.setAudioEnabled(!muted);
      return Promise.resolve(JSON.stringify({ muted }));
    });
    ctx.room.on(RoomEvent.ParticipantDisconnected, (departed) => {
      if (departed.identity === participant.identity)
        finish('user_disconnect').catch(() =>
          ctx.shutdown('caller disconnected'),
        );
    });
    session.on(voice.AgentSessionEventTypes.Close, ({ reason }) => {
      if (cleanup !== undefined) return;
      finish(
        reason === 'participant_disconnected'
          ? 'user_disconnect'
          : 'session_closed',
      ).catch(() => ctx.shutdown('session closed'));
    });
    session.on(voice.AgentSessionEventTypes.Error, (event) => {
      if (event.error.recoverable) return;
      local
        .setAttributes({ 'sv.spike.error': 'provider' })
        .catch(() => undefined);
      finish('provider_failure').catch(() => ctx.shutdown('provider failure'));
    });
    accounting.start();
    await session.start({
      agent,
      room: ctx.room,
      record: false,
      inputOptions: {
        participantIdentity: participant.identity,
        textInputCallback: (current, event) => {
          if (
            cleanup !== undefined ||
            event.participantIdentity !== participant.identity ||
            event.text.length > 2000
          )
            return;
          current.interrupt();
          current.generateReply({ userInput: event.text });
        },
      },
    });
    if (cleanup !== undefined) return;
    await local.setAttributes({ [RUNTIME_ATTRIBUTE]: RUNTIME });
    if (cleanup !== undefined) return;
    session.generateReply({
      instructions: opened.chatCtx.items.length
        ? 'Briefly welcome the caller back and let them pick up this conversation.'
        : 'Greet the caller briefly and invite them to speak or type a message.',
    });
  },
});

cli.runApp(
  new ServerOptions({
    agent: fileURLToPath(import.meta.url),
    agentName: AGENT_NAME,
    numIdleProcesses: 1,
    port: 8093,
    // Diagnostics must not include transcript/provider payloads at debug level.
    logLevel: 'warn',
  }),
);
