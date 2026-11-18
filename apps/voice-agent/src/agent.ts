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

import { parseJob } from './config.ts';

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
]) {
  if (!process.env[key]) throw new Error(`Missing ${key}`);
}

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
    const local = ctx.room.localParticipant!;
    let closed = false;
    const finish = async () => {
      if (closed) return;
      closed = true;
      clearTimeout(deadline);
      await session.close();
      await ctx.deleteRoom();
    };
    const deadline = setTimeout(() => {
      finish().catch(() => ctx.shutdown('spike deadline'));
    }, MAX_CALL_MS);
    ctx.addShutdownCallback(async () => {
      clearTimeout(deadline);
      await session.close();
    });
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
      if (!closed) finish().catch(() => ctx.shutdown('session closed'));
    });
    session.on(voice.AgentSessionEventTypes.Error, (event) => {
      if (event.error.recoverable) return;
      local
        .setAttributes({ 'sv.spike.error': 'provider' })
        .catch(() => undefined);
      finish().catch(() => ctx.shutdown('provider failure'));
    });
    await session.start({
      agent: new voice.Agent({
        instructions:
          'You are a friendly voice-call test assistant. Reply briefly in English. Typed messages and spoken messages are the same conversation. Never claim access to saved history or personal memories.',
      }),
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
      instructions:
        'Greet the caller briefly and invite them to speak or type a message.',
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
