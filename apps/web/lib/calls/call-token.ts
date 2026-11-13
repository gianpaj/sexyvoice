import { z } from 'zod';

import type { SessionConfig } from './characters';
import { getInitialInstruction } from './greetings';
import { CALL_LANGUAGES, type CallLanguage } from './languages';
import type { CallModelId } from './models';
import { callScenes, isSceneTextModified } from './scenes';

function isTimeZone(value: string): boolean {
  try {
    Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * The browser's per-call choices. call-token loads everything else from the
 * saved character.
 */
export const callTokenRequestSchema = z.object({
  characterId: z.uuid(),
  /** The browser clock as an ISO timestamp; an invalid value is dropped. */
  clientTime: z.iso.datetime({ offset: true }).optional().catch(undefined),
  language: z.enum(CALL_LANGUAGES).optional(),
  sceneId: z
    .enum(callScenes.map(({ id }) => id) as [string, ...string[]])
    .nullable()
    .optional(),
  sceneText: z.string().nullable().optional(),
  /** The browser's IANA time zone; an unknown zone is dropped. */
  timeZone: z.string().max(100).refine(isTimeZone).optional().catch(undefined),
});

export type CallTokenRequest = z.input<typeof callTokenRequestSchema>;

/**
 * LiveKit participant metadata the SexyCall agent parses. The keys and value
 * shapes are its contract. `voice` is a `voices.id` for built-in voices and
 * an `audio_references.id` for saved voices.
 */
interface AgentMetadata {
  character_id: string;
  /** The caller's clock; the agent adds local date and time to the prompt. */
  client_time?: string;
  initial_instruction: string;
  instructions: string;
  language: CallLanguage;
  max_output_tokens: number | null;
  memory: boolean;
  /** Shared user profiles plus the active character's history. */
  memory_scope: 'both';
  model: CallModelId;
  scene_id: string | null;
  scene_modified: boolean;
  temperature: number;
  time_zone?: string;
  user_id: string;
  voice: string;
}

function withScene(prompt: string, sceneText: string): string {
  return `${prompt.trim()}\n\nScene instructions:\n${sceneText}`.trim();
}

export function buildAgentMetadata({
  characterId,
  clientTime,
  language,
  memory,
  prompt,
  sceneId,
  sceneText,
  sessionConfig,
  timeZone,
  userId,
  voiceId,
}: {
  characterId: string;
  clientTime?: string;
  language: CallLanguage;
  memory: boolean;
  /** The character's prompt in the call language. */
  prompt: string;
  sceneId: string | null;
  /** Scene text the caller may use; blank sends no scene. */
  sceneText: string;
  sessionConfig: SessionConfig;
  timeZone?: string;
  userId: string;
  voiceId: string;
}): AgentMetadata {
  const scene = sceneText.trim();
  return {
    character_id: characterId,
    client_time: clientTime,
    initial_instruction: getInitialInstruction(language, sessionConfig.model),
    instructions: scene ? withScene(prompt, scene) : prompt,
    language,
    max_output_tokens: sessionConfig.maxOutputTokens,
    memory,
    memory_scope: 'both',
    model: sessionConfig.model,
    scene_id: sceneId,
    scene_modified: sceneId !== null && isSceneTextModified(sceneId, scene),
    temperature: sessionConfig.temperature,
    time_zone: timeZone,
    user_id: userId,
    voice: voiceId,
  };
}
