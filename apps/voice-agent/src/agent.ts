import { fileURLToPath } from 'node:url';
import {
  cli,
  defineAgent,
  inference,
  ServerOptions,
  voice,
} from '@livekit/agents';
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
import { createClient } from '@supabase/supabase-js';

import { parseJob } from './config.ts';
import { CallMemoryAgent, loadCallMemory } from './memory.ts';
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
    const memory = await loadCallMemory(
      db,
      job.userId,
      opened.thread.character_id,
    );
    const agentOptions = {
      chatCtx: opened.chatCtx,
      instructions: [
        opened.thread.is_voice_spike
          ? 'You are a friendly voice-call test assistant.'
          : `You are ${opened.thread.character_name}. Call language: ${opened.thread.language}.`,
        'Reply briefly. Treat typed and spoken messages as part of one conversation.',
        opened.thread.scene_instructions,
        memory?.instructions,
      ]
        .filter(Boolean)
        .join('\n'),
    };
    const agent = memory?.recall
      ? new CallMemoryAgent(agentOptions, memory.recall)
      : new voice.Agent(agentOptions);
    const session = new voice.AgentSession({
      vad: ctx.proc.userData.vad as Awaited<ReturnType<typeof VAD.load>>,
      stt: new STT({ model: 'grok-voice-transcribe-2.0', language: 'en' }),
      llm: new inference.LLM({
        model: 'xai/grok-4.20-0309-non-reasoning',
        modelOptions: { max_completion_tokens: 256 },
      }),
      tts: new TTS({
        model: 'inworld-tts-2',
        voice: job.inworldVoiceId ?? 'Ashley',
        deliveryMode: 'BALANCED',
      }),
      turnHandling: { turnDetection: 'stt', interruption: { mode: 'vad' } },
    });
    // Input remains disabled until the browser has verified this runtime.
    session.input.setAudioEnabled(false);
    let cleanup: Promise<void> | undefined;
    const close = () => {
      clearTimeout(deadline);
      cleanup ??= session.close().finally(() => thread.close());
      return cleanup;
    };
    const finish = async () => {
      await close().finally(() => ctx.deleteRoom());
    };
    const deadline = setTimeout(() => {
      finish().catch(() => ctx.shutdown('spike deadline'));
    }, MAX_CALL_MS);
    ctx.addShutdownCallback(close);
    session.on(
      voice.AgentSessionEventTypes.ConversationItemAdded,
      ({ item }) => {
        thread.append(item, () => {
          reportStorageError().finally(() =>
            finish().catch(() => ctx.shutdown('history failure')),
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
        finish().catch(() => ctx.shutdown('caller disconnected'));
    });
    session.on(voice.AgentSessionEventTypes.Close, () => {
      if (!cleanup) finish().catch(() => ctx.shutdown('session closed'));
    });
    session.on(voice.AgentSessionEventTypes.Error, (event) => {
      if (event.error.recoverable) return;
      local
        .setAttributes({ 'sv.spike.error': 'provider' })
        .catch(() => undefined);
      finish().catch(() => ctx.shutdown('provider failure'));
    });
    await session.start({
      agent,
      room: ctx.room,
      record: false,
      inputOptions: {
        participantIdentity: participant.identity,
        textInputCallback: (current, event) => {
          if (
            event.participantIdentity !== participant.identity ||
            event.text.length > 2000
          )
            return;
          current.interrupt();
          current.generateReply({ userInput: event.text });
        },
      },
    });
    await local.setAttributes({ [RUNTIME_ATTRIBUTE]: RUNTIME });
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
