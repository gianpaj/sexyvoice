import { z } from 'zod';

import type { SessionConfig } from './characters';
import { getInitialInstruction } from './greetings';
import { CALL_LANGUAGES, type CallLanguage } from './languages';
import type { CallModelId } from './models';
import { callScenes, isSceneTextModified } from './scenes';

/**
 * The browser's per-call choices. call-token loads everything else from the
 * saved character.
 */
export const callTokenRequestSchema = z.object({
  characterId: z.uuid(),
  language: z.enum(CALL_LANGUAGES).optional(),
  sceneId: z
    .enum(callScenes.map(({ id }) => id) as [string, ...string[]])
    .nullable()
    .optional(),
  sceneText: z.string().nullable().optional(),
});

export type CallTokenRequest = z.input<typeof callTokenRequestSchema>;

/**
 * LiveKit participant metadata the SexyCall agent parses. The keys and value
 * shapes are its contract. `voice` is a `voices.id` for built-in voices and
 * an `audio_references.id` for saved voices.
 */
interface AgentMetadata {
  character_id: string;
  initial_instruction: string;
  instructions: string;
  language: CallLanguage;
  max_output_tokens: number | null;
  memory: boolean;
  model: CallModelId;
  scene_id: string | null;
  scene_modified: boolean;
  temperature: number;
  user_id: string;
  voice: string;
}

/** Appends a scene to the character's prompt. */
function withScene(prompt: string, sceneText: string): string {
  return `${prompt.trim()}\n\nScene instructions:\n${sceneText}`.trim();
}

export function buildAgentMetadata({
  characterId,
  language,
  memory,
  prompt,
  sceneId,
  sceneText,
  sessionConfig,
  userId,
  voiceId,
}: {
  characterId: string;
  language: CallLanguage;
  memory: boolean;
  /** The character's prompt in the call language. */
  prompt: string;
  sceneId: string | null;
  /** Scene text the caller may use; blank sends no scene. */
  sceneText: string;
  sessionConfig: SessionConfig;
  userId: string;
  voiceId: string;
}): AgentMetadata {
  const scene = sceneText.trim();
  return {
    character_id: characterId,
    initial_instruction: getInitialInstruction(language, sessionConfig.model),
    instructions: scene ? withScene(prompt, scene) : prompt,
    language,
    max_output_tokens: sessionConfig.maxOutputTokens,
    memory,
    model: sessionConfig.model,
    scene_id: sceneId,
    scene_modified: sceneId !== null && isSceneTextModified(sceneId, scene),
    temperature: sessionConfig.temperature,
    user_id: userId,
    voice: voiceId,
  };
}
