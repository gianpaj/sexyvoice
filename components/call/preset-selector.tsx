'use client';

import { useConnectionState } from '@livekit/components-react';
import { ConnectionState } from 'livekit-client';
import { Trash2 } from 'lucide-react';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
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
import { Button } from '@/components/ui/button';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';
import { useConnection } from '@/hooks/use-connection';
import { usePlaygroundState } from '@/hooks/use-playground-state';

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase())
    .slice(0, 2)
    .join('');
}

function AvatarButton({
  name,
  image,
  isSelected,
  isConnected,
  onClick,
}: {
  name: string;
  image?: string;
  isSelected: boolean;
  isConnected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={isSelected}
      className="group flex flex-col items-center gap-2"
      disabled={isConnected}
      onClick={onClick}
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
          <div className="relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-neutral-800 sm:h-16 sm:w-16">
            {image ? (
              <Image
                alt={name}
                className={`object-cover transition-all duration-300 ${
                  isConnected && !isSelected ? 'opacity-40 grayscale' : ''
                }`}
                fill
                src={`/characters/${image}`}
              />
            ) : (
              <span
                className={`select-none font-semibold text-neutral-300 text-sm transition-all duration-300 ${
                  isConnected && !isSelected ? 'opacity-40' : ''
                }`}
              >
                {getInitials(name)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Name */}
      <span
        className={`max-w-16 truncate font-medium text-xs transition-colors sm:max-w-20 ${
          isSelected ? 'text-foreground' : 'text-muted-foreground'
        } ${isConnected && !isSelected ? 'opacity-40' : ''}`}
      >
        {name}
      </span>
    </button>
  );
}

const gridColsClass: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
  6: 'grid-cols-6',
};

export function PresetSelector() {
  const { pgState, dispatch, helpers } = usePlaygroundState();
  const { disconnect, connect, shouldConnect, dict } = useConnection();
  const connectionState = useConnectionState();
  const isConnected = connectionState === ConnectionState.Connected;

  const searchParams = useSearchParams();
  const showInstruction =
    searchParams.get('showInstruction') === '' ||
    searchParams.get('showInstruction') === 'true';

  const [lastPresetId, setLastPresetId] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [characterToDelete, setCharacterToDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);

  // Get default character presets (those with images)
  const defaultCharacters = helpers
    .getDefaultPresets()
    .filter((preset) => preset.image);

  const customCharacters = pgState.customCharacters;
  const hasCustomCharacters = customCharacters.length > 0;

  // All characters combined for carousel pages
  const allCharacters = [...defaultCharacters, ...customCharacters];

  // Split into pages of 6 for the carousel
  const pages: (typeof allCharacters)[] = [];
  const PAGE_SIZE = 6;
  for (let i = 0; i < allCharacters.length; i += PAGE_SIZE) {
    pages.push(allCharacters.slice(i, i + PAGE_SIZE));
  }

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

  const handleDelete = () => {
    if (!characterToDelete) {
      return;
    }
    // If the deleted character is currently selected, select the first default
    if (pgState.selectedPresetId === characterToDelete.id) {
      handlePresetSelect(defaultCharacters[0]?.id ?? null);
    }
    dispatch({
      type: 'DELETE_CUSTOM_CHARACTER',
      payload: characterToDelete.id,
    });
    setShowDeleteDialog(false);
    setCharacterToDelete(null);
    toast.info('Character removed');
  };

  const isCustomCharacter = (id: string) =>
    customCharacters.some((c) => c.id === id);

  return (
    <>
      <div className="w-full">
        {/* Character Avatar Selection */}
        <div className="mb-4 font-semibold text-neutral-400 text-xs uppercase tracking-widest">
          {dict.chooseCharacter}
        </div>

        {/* Avatar Row / Carousel */}
        {showInstruction && hasCustomCharacters ? (
          <div className="relative mb-4 md:px-10">
            <Carousel opts={{ align: 'start', loop: false }}>
              <CarouselContent className="-ml-2">
                {pages.map((page, pageIndex) => (
                  <CarouselItem
                    className="basis-full pl-2"
                    key={`page-${pageIndex}`}
                  >
                    <div
                      className={`grid gap-3 ${gridColsClass[Math.min(page.length, 6) as keyof typeof gridColsClass] || 'grid-cols-6'}`}
                    >
                      {page.map((preset) => {
                        const isSelected =
                          pgState.selectedPresetId === preset.id;
                        const isCustom = isCustomCharacter(preset.id);
                        return (
                          <div
                            className="group/card relative flex flex-col items-center"
                            key={preset.id}
                          >
                            <AvatarButton
                              image={preset.image}
                              isConnected={isConnected}
                              isSelected={isSelected}
                              name={preset.name}
                              onClick={() => handlePresetSelect(preset.id)}
                            />
                            {/* Delete button for custom characters */}
                            {isCustom && !isConnected && (
                              <button
                                aria-label={`Delete ${preset.name}`}
                                className="absolute -top-1 -right-1 z-10 rounded-full bg-destructive p-1 text-destructive-foreground opacity-0 transition-opacity hover:bg-destructive/80 focus:opacity-100 group-hover/card:opacity-100"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCharacterToDelete({
                                    id: preset.id,
                                    name: preset.name,
                                  });
                                  setShowDeleteDialog(true);
                                }}
                                title={`Delete ${preset.name}`}
                                type="button"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </CarouselItem>
                ))}
              </CarouselContent>
              {pages.length > 1 && (
                <>
                  <CarouselPrevious
                    className="-left-2 h-7 w-7 border-separator1 bg-muted text-foreground hover:bg-muted/80"
                    variant="outline"
                  />
                  <CarouselNext
                    className="-right-2 h-7 w-7 border-separator1 bg-muted text-foreground hover:bg-muted/80"
                    variant="outline"
                  />
                </>
              )}
            </Carousel>
          </div>
        ) : (
          /* Default: simple row of 4 default characters */
          <div className="mb-4 flex items-start justify-between">
            {defaultCharacters.map((preset) => (
              <AvatarButton
                image={preset.image}
                isConnected={isConnected}
                isSelected={pgState.selectedPresetId === preset.id}
                key={preset.id}
                name={preset.name}
                onClick={() => handlePresetSelect(preset.id)}
              />
            ))}
          </div>
        )}

        {/* Bio Card */}
        <div
          className={`rounded-xl bg-muted p-4 transition-all duration-300 ${
            selectedPreset
              ? 'translate-y-0 opacity-100'
              : 'pointer-events-none h-0 translate-y-2 overflow-hidden p-0 opacity-0'
          }`}
        >
          {selectedPreset && (
            <p className="text-foreground text-sm">
              <span className="font-semibold">{selectedPreset.name}:</span>{' '}
              {selectedPreset.description}
            </p>
          )}
        </div>
      </div>

      <AlertDialog onOpenChange={setShowDeleteDialog} open={showDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete &quot;{characterToDelete?.name}&quot;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. The character and its settings will be
              permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button onClick={handleDelete} variant="destructive">
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
