'use client';

import { useConnectionState } from '@livekit/components-react';
import { ConnectionState } from 'livekit-client';
import { Save, SaveAll } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Preset } from '@/data/presets';
import { usePlaygroundState } from '@/hooks/use-playground-state';

function mapApiCharacterToPreset(character: {
  id: string;
  name: string;
  localized_descriptions?: Record<string, string> | null;
  image?: string | null;
  session_config?: {
    model?: string;
    voice?: string;
    temperature?: number;
    maxOutputTokens?: number | null;
    max_output_tokens?: number | null;
    grokImageEnabled?: boolean;
    grok_image_enabled?: boolean;
  } | null;
  sort_order?: number;
  is_public?: boolean;
  voice_id?: string;
  voices?: { name?: string | null; sample_url?: string | null } | null;
  prompt_id?: string;
  prompts?: {
    prompt?: string | null;
    localized_prompts?: Record<string, string> | null;
  } | null;
}): Preset {
  const sessionConfig = character.session_config ?? {};

  return {
    id: character.id,
    name: character.name,
    localizedDescriptions: character.localized_descriptions ?? {},
    image: character.image ?? undefined,
    instructions: character.prompts?.prompt ?? '',
    localizedInstructions: character.prompts?.localized_prompts ?? {},
    sessionConfig: {
      model: (sessionConfig.model ?? 'grok-4-1-fast-non-reasoning') as Preset['sessionConfig']['model'],
      voice: sessionConfig.voice ?? character.voices?.name ?? 'Ara',
      temperature: sessionConfig.temperature ?? 0.8,
      maxOutputTokens:
        sessionConfig.maxOutputTokens ?? sessionConfig.max_output_tokens ?? null,
      grokImageEnabled:
        sessionConfig.grokImageEnabled ?? sessionConfig.grok_image_enabled ?? false,
    },
    promptId: character.prompt_id,
    voiceId: character.voice_id,
    voiceName: character.voices?.name ?? undefined,
    voiceSampleUrl: character.voices?.sample_url ?? undefined,
    isPublic: character.is_public,
  };
}

export function PresetSave() {
  const connectionState = useConnectionState();
  const isConnected = connectionState === ConnectionState.Connected;
  const { pgState, dispatch, helpers } = usePlaygroundState();
  const selectedPreset = helpers.getSelectedPreset(pgState);
  const defaultPresets = helpers.getDefaultPresets();
  const isDefaultPreset = selectedPreset
    ? defaultPresets.some((p) => p.id === selectedPreset.id)
    : false;
  const customCharactersCount = pgState.customCharacters.length;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setName(
      isDefaultPreset
        ? `${selectedPreset?.name} (copy)`
        : selectedPreset?.name || '',
    );
    setDescription(
      selectedPreset?.localizedDescriptions?.[pgState.language] ??
        selectedPreset?.localizedDescriptions?.en ??
        '',
    );
  }, [selectedPreset, isDefaultPreset, pgState.language]);

  // Save as new character (opens dialog)
  const handleSaveAsNew = async () => {
    const response = await fetch('/api/characters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        localizedDescriptions: { [pgState.language]: description },
        prompt: pgState.instructions,
        localizedPrompts: { [pgState.language]: pgState.instructions },
        sessionConfig: pgState.sessionConfig,
        voiceName: pgState.sessionConfig.voice,
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      toast.error(result.error ?? 'Failed to create character');
      return;
    }

    const newPreset = mapApiCharacterToPreset(result);
    dispatch({ type: 'SAVE_CUSTOM_CHARACTER', payload: newPreset });
    dispatch({ type: 'SET_SELECTED_PRESET_ID', payload: newPreset.id });

    setOpen(false);
    toast.success('Character created');
  };

  const handleSave = async () => {
    if (!selectedPreset || isDefaultPreset) return;

    const response = await fetch('/api/characters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: selectedPreset.id,
        name: selectedPreset.name,
        localizedDescriptions: {
          ...(selectedPreset.localizedDescriptions ?? {}),
          [pgState.language]: description,
        },
        prompt: pgState.instructions,
        localizedPrompts: {
          ...(selectedPreset.localizedInstructions ?? {}),
          [pgState.language]: pgState.instructions,
        },
        sessionConfig: pgState.sessionConfig,
        voiceName: pgState.sessionConfig.voice,
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      toast.error(result.error ?? 'Failed to update character');
      return;
    }

    const updatedPreset = mapApiCharacterToPreset(result);
    dispatch({ type: 'SAVE_CUSTOM_CHARACTER', payload: updatedPreset });
    toast.success('Character saved');
  };

  return (
    <div className="flex items-center gap-2">
      {!isDefaultPreset && (
        <Button
          disabled={!selectedPreset || isConnected}
          onClick={handleSave}
          size="sm"
          variant="secondary"
        >
          <Save className="h-4 w-4" />
          <span className="ml-2">Save</span>
        </Button>
      )}

      {/* Save as new button - opens dialog */}
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogTrigger asChild>
          <Button
            disabled={isConnected || customCharactersCount >= 10}
            size="sm"
            variant="secondary"
          >
            <SaveAll className="h-4 w-4" />
            <span className="ml-2">Save as new</span>
          </Button>
        </DialogTrigger>
        <DialogContent className="bg-background sm:max-w-[475px]">
          <DialogHeader>
            <DialogTitle>Save as new character</DialogTitle>
            <DialogDescription>
              This will create a new custom character with the current settings.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                autoComplete="off"
                autoFocus
                id="name"
                onChange={(e) => setName(e.target.value)}
                value={name}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                onChange={(e) => setDescription(e.target.value)}
                value={description}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              className="font-semibold text-sm"
              disabled={!name.trim()}
              onClick={handleSaveAsNew}
              type="submit"
              variant="secondary"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
