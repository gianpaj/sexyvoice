'use client';

import { useConnectionState } from '@livekit/components-react';
import { ConnectionState } from 'livekit-client';
import { RotateCcw, Save, SaveAll } from 'lucide-react';
import { useEffect, useState } from 'react';

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

export function PresetSave() {
  const connectionState = useConnectionState();
  const isConnected = connectionState === ConnectionState.Connected;
  const { pgState, dispatch, helpers } = usePlaygroundState();
  const selectedPreset = helpers.getSelectedPreset(pgState);
  const defaultPresets = helpers.getDefaultPresets();
  const isDefaultPreset = selectedPreset
    ? defaultPresets.some((p) => p.id === selectedPreset.id)
    : false;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [open, setOpen] = useState(false);

  // Check if there are character overrides for the selected preset in the current language
  const hasOverrides =
    pgState.selectedPresetId &&
    pgState.characterOverrides[pgState.selectedPresetId]?.[pgState.language];

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
  const handleSaveAsNew = () => {
    const newPreset: Preset = {
      id: crypto.randomUUID(),
      name,
      localizedDescriptions: { [pgState.language]: description },
      instructions: pgState.instructions,
      localizedInstructions: { [pgState.language]: pgState.instructions },
      sessionConfig: pgState.sessionConfig,
    };

    dispatch({ type: 'SAVE_CUSTOM_CHARACTER', payload: newPreset });
    dispatch({ type: 'SET_SELECTED_PRESET_ID', payload: newPreset.id });

    setOpen(false);
  };

  // Save current character: override instructions for defaults, or overwrite custom characters
  const handleSave = () => {
    if (!selectedPreset) return;

    if (isDefaultPreset) {
      // For default characters, save as a character override
      if (pgState.selectedPresetId) {
        dispatch({
          type: 'SET_CHARACTER_OVERRIDE',
          payload: {
            characterId: pgState.selectedPresetId,
            instructions: pgState.instructions,
          },
        });
      }
    } else {
      // For custom characters, overwrite the full preset
      const updatedPreset: Preset = {
        ...selectedPreset,
        instructions: pgState.instructions,
        sessionConfig: pgState.sessionConfig,
      };
      dispatch({ type: 'SAVE_CUSTOM_CHARACTER', payload: updatedPreset });
    }
  };

  // Reset character instructions to default
  const handleReset = () => {
    if (pgState.selectedPresetId) {
      dispatch({
        type: 'RESET_CHARACTER_OVERRIDE',
        payload: pgState.selectedPresetId,
      });
    }
  };

  return (
    <div className="flex items-center gap-2">
      {/* Save button - saves override for default characters, or overwrites custom characters */}
      <Button
        disabled={!selectedPreset || isConnected}
        onClick={handleSave}
        size="sm"
        variant="secondary"
      >
        <Save className="h-4 w-4" />
        <span className="ml-2">Save</span>
      </Button>

      {/* Save as new button - opens dialog */}
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogTrigger asChild>
          <Button disabled={isConnected} size="sm" variant="secondary">
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
              onClick={handleSaveAsNew}
              type="submit"
              variant="secondary"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset button - only shown when there are character overrides */}
      {hasOverrides && (
        <Button
          className="text-muted-foreground hover:text-foreground"
          disabled={isConnected}
          onClick={handleReset}
          size="sm"
          variant="ghost"
        >
          <RotateCcw className="h-4 w-4" />
          <span className="hidden md:ml-2 md:block">Reset</span>
        </Button>
      )}
    </div>
  );
}
