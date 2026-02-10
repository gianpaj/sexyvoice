'use client';

import { useConnectionState } from '@livekit/components-react';
import { ConnectionState } from 'livekit-client';
import Image from 'next/image';
import { useEffect, useState } from 'react';

import { useConnection } from '@/hooks/use-connection';
import { usePlaygroundState } from '@/hooks/use-playground-state';

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
  //       type: 'DELETE_CUSTOM_CHARACTER',
  //       payload: presetToDelete.id,
  //     });
  //     setShowDeleteDialog(false);
  //     setPresetToDelete(null);
  //     toast.info('Character removed');
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
        <div className="mb-4 flex items-start justify-between">
          {characterPresets.map((preset) => {
            const isSelected = pgState.selectedPresetId === preset.id;
            return (
              <button
                aria-pressed={isSelected}
                className="group flex flex-col items-center gap-2"
                disabled={isConnected}
                key={preset.id}
                onClick={() => handlePresetSelect(preset.id)}
                type="button"
              >
                {/* Avatar with Instagram-style ring */}
                <div
                  className={`relative rounded-full p-[3px] transition-all duration-300 ${
                    isSelected
                      ? 'bg-gradient-to-tr from-violet-500 via-purple-500 to-fuchsia-500'
                      : 'bg-transparent'
                  } ${isConnected ? '' : 'group-hover:scale-105'}`}
                >
                  <div className="rounded-full bg-background p-[2px]">
                    <div className="relative h-14 w-14 overflow-hidden rounded-full bg-neutral-800 sm:h-16 sm:w-16">
                      {preset.image && (
                        <Image
                          alt={preset.name}
                          className={`object-cover transition-all duration-300 ${
                            isConnected && !isSelected
                              ? 'opacity-40 grayscale'
                              : ''
                          }`}
                          fill
                          src={`/characters/${preset.image}`}
                        />
                      )}
                    </div>
                  </div>
                </div>

                {/* Name */}
                <span
                  className={`font-medium text-xs transition-colors ${
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
          className={`rounded-xl bg-muted p-4 transition-all duration-300 ${
            selectedPreset?.image
              ? 'translate-y-0 opacity-100'
              : 'pointer-events-none h-0 translate-y-2 overflow-hidden p-0 opacity-0'
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
