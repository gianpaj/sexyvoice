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
import { useConnection } from '@/hooks/use-connection';
import { usePlaygroundState } from '@/hooks/use-playground-state';
import { buildSaveCharacterPayload, saveCharacter } from '@/lib/characters';

export function PresetSave() {
  const connectionState = useConnectionState();
  const isConnected = connectionState === ConnectionState.Connected;
  const { playgroundState, dispatch, helpers } = usePlaygroundState();
  const { dict } = useConnection();
  const t = dict.savePreset;
  const selectedPreset = helpers.getSelectedPreset(playgroundState);
  const defaultPresets = helpers.getDefaultPresets();
  const isDefaultPreset = selectedPreset
    ? defaultPresets.some((p) => p.id === selectedPreset.id)
    : false;
  const customCharactersCount = playgroundState.customCharacters.length;

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
      selectedPreset?.localizedDescriptions?.[playgroundState.language] ??
        selectedPreset?.localizedDescriptions?.en ??
        '',
    );
  }, [selectedPreset, isDefaultPreset, playgroundState.language]);

  // Save as new character (opens dialog)
  const handleSaveAsNew = async () => {
    const result = await saveCharacter({
      id: '',
      name,
      localizedDescriptions: { [playgroundState.language]: description },
      prompt: playgroundState.instructions,
      localizedPrompts: { [playgroundState.language]: playgroundState.instructions },
      sessionConfig: playgroundState.sessionConfig,
      voiceName: playgroundState.sessionConfig.voice,
    });
    if (!result.ok) {
      toast.error(result.error ?? t.failedToCreate);
      return;
    }

    dispatch({ type: 'SAVE_CUSTOM_CHARACTER', payload: result.preset });
    dispatch({ type: 'SET_SELECTED_PRESET_ID', payload: result.preset.id });
    setOpen(false);
    toast.success(t.characterCreated);
  };

  const handleSave = async () => {
    if (!selectedPreset || isDefaultPreset || !selectedPreset.name.trim())
      return;

    const instructions = helpers.resolveActiveInstructions(playgroundState);
    const payload = buildSaveCharacterPayload(
      {
        ...selectedPreset,
        localizedDescriptions: {
          ...(selectedPreset.localizedDescriptions ?? {}),
          [playgroundState.language]: description,
        },
      },
      playgroundState.language,
      instructions,
    );
    const result = await saveCharacter(payload);
    if (!result.ok) {
      toast.error(result.error ?? t.failedToUpdate);
      return;
    }

    dispatch({ type: 'SAVE_CUSTOM_CHARACTER', payload: result.preset });
    toast.success(t.characterSaved);
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
          <span className="ml-2">{t.save}</span>
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
            <span className="ml-2">{t.saveAsNew}</span>
          </Button>
        </DialogTrigger>
        <DialogContent className="bg-background sm:max-w-[475px]">
          <DialogHeader>
            <DialogTitle>{t.saveAsNewTitle}</DialogTitle>
            <DialogDescription>{t.saveAsNewDescription}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">{t.nameLabel}</Label>
              <Input
                autoComplete="off"
                autoFocus
                id="name"
                onChange={(e) => setName(e.target.value)}
                value={name}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">{t.descriptionLabel}</Label>
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
              {t.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
