'use client';

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
  const { pgState, dispatch, helpers } = usePlaygroundState();
  const selectedPreset = helpers.getSelectedPreset(pgState);
  const defaultPresets = helpers.getDefaultPresets();
  const isDefaultPreset = selectedPreset
    ? defaultPresets.some((p) => p.id === selectedPreset.id)
    : false;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [open, setOpen] = useState(false);

  // Check if there are character overrides for the selected preset
  const hasOverrides =
    pgState.selectedPresetId &&
    pgState.characterOverrides[pgState.selectedPresetId];

  useEffect(() => {
    setName(
      isDefaultPreset
        ? `${selectedPreset?.name} (copy)`
        : selectedPreset?.name || '',
    );
    setDescription(selectedPreset?.description || '');
  }, [selectedPreset, isDefaultPreset]);

  // Save as new character (opens dialog)
  const handleSaveAsNew = () => {
    const newPreset: Preset = {
      id: crypto.randomUUID(),
      name,
      description,
      instructions: pgState.instructions,
      sessionConfig: pgState.sessionConfig,
    };

    dispatch({ type: 'SAVE_CUSTOM_CHARACTER', payload: newPreset });
    dispatch({ type: 'SET_SELECTED_PRESET_ID', payload: newPreset.id });

    setOpen(false);
  };

  // Save/overwrite current custom character (only for non-default presets)
  const handleSave = () => {
    if (!selectedPreset || isDefaultPreset) return;

    const updatedPreset: Preset = {
      ...selectedPreset,
      instructions: pgState.instructions,
      sessionConfig: pgState.sessionConfig,
    };

    dispatch({ type: 'SAVE_CUSTOM_CHARACTER', payload: updatedPreset });
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
      {/* Save button - for custom characters (non-default presets) */}
      <Button
        disabled={isDefaultPreset || !selectedPreset}
        onClick={handleSave}
        size="sm"
        variant="secondary"
      >
        <Save className="h-4 w-4" />
        <span className="hidden md:ml-2 md:block">Save</span>
      </Button>

      {/* Save as new button - opens dialog */}
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogTrigger asChild>
          <Button size="sm" variant="secondary">
            <SaveAll className="h-4 w-4" />
            <span className="hidden md:ml-2 md:block">Save as new</span>
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
