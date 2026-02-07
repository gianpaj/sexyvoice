'use client';

import { useConnectionState } from '@livekit/components-react';
import { ConnectionState } from 'livekit-client';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useConnection } from '@/hooks/use-connection';
import { usePlaygroundState } from '@/hooks/use-playground-state';
import type { Preset } from '../../data/presets';

export function PresetSelector() {
  // const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  // const [presetToDelete, setPresetToDelete] = useState<Preset | null>(null);
  const { pgState, dispatch, helpers } = usePlaygroundState();
  const { disconnect, connect, shouldConnect, dict } = useConnection();
  const connectionState = useConnectionState();
  const isConnected = connectionState === ConnectionState.Connected;

  const [lastPresetId, setLastPresetId] = useState<string | null>(null);

  // Get character presets (those with images)
  const characterPresets = helpers
    .getDefaultPresets()
    .filter((preset) => preset.image);

  const selectedPreset = helpers.getSelectedPreset(pgState);

  useEffect(() => {
    if (pgState.selectedPresetId !== lastPresetId) {
      setLastPresetId(pgState.selectedPresetId);
      if (shouldConnect) {
        disconnect().then(() => {
          connect();
        });
      }
    }
  }, [
    pgState.selectedPresetId,
    shouldConnect,
    disconnect,
    connect,
    lastPresetId,
  ]);

  // const handleDelete = () => {
  //   if (presetToDelete) {
  //     dispatch({
  //       type: 'DELETE_USER_PRESET',
  //       payload: presetToDelete.id,
  //     });
  //     setShowDeleteDialog(false);
  //     setPresetToDelete(null);
  //     toast.info('Preset removed');
  //   }
  // };

  const handlePresetSelect = (presetId: string | null) => {
    if (isConnected) return;

    dispatch({
      type: 'SET_SELECTED_PRESET_ID',
      payload: presetId,
    });

    // Update URL with preset
    const params = helpers.encodeToUrlParams({
      ...pgState,
      selectedPresetId: presetId,
    });
    window.history.replaceState(
      {},
      document.title,
      `${window.location.pathname}${params ? `?${params}` : ''}`,
    );
  };

  return (
    <>
      <div className="w-full">
        {/* Character Avatar Selection */}
        <div className="mb-4 font-semibold text-neutral-400 text-xs uppercase tracking-widest">
          {dict.chooseCharacter}
        </div>

        {/* Avatar Row */}
        <div className="mb-4 flex justify-between items-start">
          {characterPresets.map((preset) => {
            const isSelected = pgState.selectedPresetId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handlePresetSelect(preset.id)}
                disabled={isConnected}
                className="flex flex-col items-center gap-2 group"
                aria-pressed={isSelected}
              >
                {/* Avatar with Instagram-style ring */}
                <div
                  className={`relative rounded-full p-[3px] transition-all duration-300 ${
                    isSelected
                      ? 'bg-gradient-to-tr from-violet-500 via-purple-500 to-fuchsia-500'
                      : 'bg-transparent'
                  } ${!isConnected ? 'group-hover:scale-105' : ''}`}
                >
                  <div className="rounded-full p-[2px] bg-background">
                    <div className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-full overflow-hidden bg-neutral-800">
                      {preset.image && (
                        <Image
                          src={`/characters/${preset.image}`}
                          alt={preset.name}
                          fill
                          className={`object-cover transition-all duration-300 ${
                            isConnected && !isSelected
                              ? 'opacity-40 grayscale'
                              : ''
                          }`}
                        />
                      )}
                    </div>
                  </div>
                </div>

                {/* Name */}
                <span
                  className={`text-xs font-medium transition-colors ${
                    isSelected ? 'text-foreground' : 'text-muted-foreground'
                  } ${isConnected && !isSelected ? 'opacity-40' : ''}`}
                >
                  {preset.name}
                </span>
              </button>
            );
          })}
        </div>

        {/* Bio Card */}
        <div
          className={`bg-muted rounded-xl p-4 transition-all duration-300 ${
            selectedPreset?.image
              ? 'opacity-100 translate-y-0'
              : 'opacity-0 translate-y-2 pointer-events-none h-0 p-0 overflow-hidden'
          }`}
        >
          {selectedPreset?.image && (
            <p className="text-foreground text-sm">
              <span className="font-semibold">{selectedPreset.name}:</span>{' '}
              {selectedPreset.description}
            </p>
          )}
        </div>
      </div>

      {/*<AlertDialog onOpenChange={setShowDeleteDialog} open={showDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete &quot;{presetToDelete?.name}&quot;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button onClick={handleDelete} variant="destructive">
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>*/}
    </>
  );
}
