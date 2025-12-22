'use client';

import { Save } from 'lucide-react';
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
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setName(
      selectedPreset?.defaultGroup
        ? `${selectedPreset.name} (copy)`
        : selectedPreset?.name || '',
    );
    setDescription(selectedPreset?.description || '');
  }, [selectedPreset]);

  const handleSave = () => {
    const newPreset: Preset = {
      id:
        selectedPreset && !selectedPreset.defaultGroup
          ? selectedPreset.id
          : crypto.randomUUID(),
      name,
      description,
      instructions: pgState.instructions,
      sessionConfig: pgState.sessionConfig,
      defaultGroup: undefined,
    };

    dispatch({ type: 'SAVE_USER_PRESET', payload: newPreset });
    if (selectedPreset?.id !== newPreset.id) {
      dispatch({ type: 'SET_SELECTED_PRESET_ID', payload: newPreset.id });
    }

    setOpen(false);
  };

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary">
          <Save className="h-4 w-4" />
          <span className="hidden md:ml-2 md:block">Save</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-background sm:max-w-[475px]">
        <DialogHeader>
          <DialogTitle>Save preset</DialogTitle>
          <DialogDescription>
            This will save the current playground settings so you can access it
            later.
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
            onClick={handleSave}
            type="submit"
            variant="secondary"
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
