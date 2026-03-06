'use client';

import { useConnectionState } from '@livekit/components-react';
import { ConnectionState } from 'livekit-client';
import { Pencil, Plus, Trash2 } from 'lucide-react';
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
import { Button } from '@/components/ui/button';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PremiumActionButton } from '@/components/ui/premium-action-button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { defaultSessionConfig } from '@/data/default-config';
import type { Preset } from '@/data/presets';
import type { DBVoice } from '@/data/voices';
import { useConnection } from '@/hooks/use-connection';
import { usePlaygroundState } from '@/hooks/use-playground-state';
import { mapApiCharacterToPreset, saveCharacter } from '@/lib/characters';
import {
  CreateCharacterDialog,
  type NewCharacterPayload,
} from './create-character-dialog';
import { VoicePlayButton } from './voice-play-button';

const MAX_CUSTOM_CHARACTERS = 10;

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
      className="group flex flex-col items-center gap-2"
      data-selected={isSelected ? 'true' : 'false'}
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

interface PresetSelectorProps {
  isPaidUser?: boolean;
  callVoices?: DBVoice[];
}

export function PresetSelector({
  isPaidUser = false,
  callVoices = [],
}: PresetSelectorProps) {
  const { pgState, dispatch, helpers } = usePlaygroundState();
  const { disconnect, connect, shouldConnect, dict } = useConnection();
  const connectionState = useConnectionState();
  const isConnected = connectionState === ConnectionState.Connected;

  const [lastPresetId, setLastPresetId] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [characterToDelete, setCharacterToDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);

  // Editable fields for custom characters
  const [isEditingName, setIsEditingName] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [editableName, setEditableName] = useState('');
  const [editableDescription, setEditableDescription] = useState('');

  // Track unsaved voice change — only persisted on Save or call start
  const [pendingVoiceName, setPendingVoiceName] = useState<string | null>(null);

  // Get default character presets (those with images)
  const defaultCharacters = helpers
    .getDefaultPresets()
    .filter((preset) => preset.image);

  const customCharacters = pgState.customCharacters;
  const canAddMore = customCharacters.length < MAX_CUSTOM_CHARACTERS;

  // All characters combined — each is its own carousel slide
  const allCharacters = [...defaultCharacters, ...customCharacters];

  const selectedPreset = helpers.getSelectedPreset(pgState);

  useEffect(() => {
    if (pgState.selectedPresetId !== lastPresetId) {
      setLastPresetId(pgState.selectedPresetId);
      if (shouldConnect) {
        disconnect().then(() => {
          connect(pendingVoiceName);
        });
      }
    }
  }, [
    pgState.selectedPresetId,
    shouldConnect,
    disconnect,
    connect,
    lastPresetId,
    pendingVoiceName,
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

  const handleOpenCreateDialog = () => {
    if (!canAddMore || isConnected) return;
    setShowCreateDialog(true);
  };

  const handleCreateCharacter = async (payload: NewCharacterPayload) => {
    const response = await fetch('/api/characters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: payload.name,
        localizedDescriptions: { [pgState.language]: payload.description },
        prompt: payload.prompt,
        localizedPrompts: {},
        sessionConfig: { ...defaultSessionConfig, ...pgState.sessionConfig },
        voiceName: payload.voiceName,
      }),
    });

    const result = await response.json();
    if (!response.ok) {
      toast.error(result.error ?? dict.presetSelector.failedToCreate);
      throw new Error(result.error ?? dict.presetSelector.failedToCreate);
    }

    const newPreset = mapApiCharacterToPreset(result);
    dispatch({ type: 'SAVE_CUSTOM_CHARACTER', payload: newPreset });
    dispatch({ type: 'SET_SELECTED_PRESET_ID', payload: newPreset.id });
    toast.success(dict.presetSelector.characterCreated);
  };

  // Build updated localizedDescriptions with the new description value
  const buildUpdatedDescriptions = (
    existing: Partial<Record<string, string>> | undefined,
    language: string,
    newValue: string,
  ): Record<string, string> => {
    const result: Record<string, string> = {};
    if (existing) {
      for (const [key, value] of Object.entries(existing)) {
        if (value !== undefined) {
          result[key] = value;
        }
      }
    }
    result[language] = newValue;
    return result;
  };

  // Handle voice dropdown change — updates in-memory state only.
  // The pending voice name is passed to connect() so use-connection
  // can persist it (along with any instruction changes) in one API call.
  const handleVoiceChange = (newVoiceName: string) => {
    if (!(selectedPreset && isSelectedCustom) || isConnected) return;

    const currentVoice =
      selectedPreset.voiceName || selectedPreset.sessionConfig.voice;
    if (newVoiceName === currentVoice) {
      setPendingVoiceName(null);
      return;
    }

    setPendingVoiceName(newVoiceName);

    // Update in-memory state so sessionConfig.voice is correct if a call starts
    const updatedVoice = callVoices.find((v) => v.name === newVoiceName);
    const updatedPreset: Preset = {
      ...selectedPreset,
      sessionConfig: {
        ...selectedPreset.sessionConfig,
        voice: newVoiceName,
      },
      voiceName: newVoiceName,
      voiceId: updatedVoice?.id,
      voiceSampleUrl: updatedVoice?.sample_url ?? undefined,
    };
    dispatch({ type: 'SAVE_CUSTOM_CHARACTER', payload: updatedPreset });
  };

  // Clear pending voice when switching characters
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset pending voice when selected preset changes
  useEffect(() => {
    setPendingVoiceName(null);
  }, [pgState.selectedPresetId]);

  const handleSaveNameOrDescription = async () => {
    if (!(selectedPreset && isCustomCharacter(selectedPreset.id))) {
      setIsEditingName(false);
      setIsEditingDescription(false);
      return;
    }

    const nameChanged =
      isEditingName && editableName.trim() !== selectedPreset.name;
    const currentDesc =
      selectedPreset.localizedDescriptions?.[pgState.language] ?? '';
    const descChanged =
      isEditingDescription && editableDescription.trim() !== currentDesc;

    if (!(nameChanged || descChanged)) {
      setIsEditingName(false);
      setIsEditingDescription(false);
      return;
    }

    const newName = nameChanged ? editableName.trim() : selectedPreset.name;
    const newDescriptions = descChanged
      ? buildUpdatedDescriptions(
          selectedPreset.localizedDescriptions,
          pgState.language,
          editableDescription.trim(),
        )
      : selectedPreset.localizedDescriptions;

    const saveResult = await saveCharacter({
      id: selectedPreset.id,
      name: newName,
      localizedDescriptions: newDescriptions ?? {},
      prompt: selectedPreset.instructions,
      localizedPrompts: selectedPreset.localizedInstructions ?? {},
      sessionConfig: selectedPreset.sessionConfig,
      voiceName: selectedPreset.voiceName ?? selectedPreset.sessionConfig.voice,
    });
    if (!saveResult.ok) {
      toast.error(saveResult.error ?? dict.presetSelector.failedToUpdate);
      return;
    }

    dispatch({ type: 'SAVE_CUSTOM_CHARACTER', payload: saveResult.preset });
    toast.success(dict.presetSelector.characterUpdated);

    setIsEditingName(false);
    setIsEditingDescription(false);
  };

  // Start editing name
  const handleStartEditName = () => {
    if (selectedPreset && isCustomCharacter(selectedPreset.id)) {
      setEditableName(selectedPreset.name);
      setIsEditingName(true);
    }
  };

  // Start editing description
  const handleStartEditDescription = () => {
    if (selectedPreset && isCustomCharacter(selectedPreset.id)) {
      setEditableDescription(
        selectedPreset.localizedDescriptions?.[pgState.language] ??
          selectedPreset.localizedDescriptions?.en ??
          '',
      );
      setIsEditingDescription(true);
    }
  };

  // Cancel editing
  const handleCancelEdit = () => {
    setIsEditingName(false);
    setIsEditingDescription(false);
  };

  const handleDelete = async () => {
    if (!characterToDelete) {
      return;
    }

    const response = await fetch('/api/characters', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: characterToDelete.id }),
    });
    const result = await response.json();
    if (!response.ok) {
      toast.error(result.error ?? dict.presetSelector.failedToDelete);
      return;
    }

    if (pgState.selectedPresetId === characterToDelete.id) {
      handlePresetSelect(defaultCharacters[0]?.id ?? null);
    }

    dispatch({
      type: 'DELETE_CUSTOM_CHARACTER',
      payload: characterToDelete.id,
    });
    setShowDeleteDialog(false);
    setCharacterToDelete(null);
    toast.info(dict.presetSelector.characterRemoved);
  };

  const isCustomCharacter = (id: string) =>
    customCharacters.some((c) => c.id === id);

  const isSelectedCustom =
    selectedPreset && isCustomCharacter(selectedPreset.id);

  // Resolved voice for the selected custom character (used by voice selector + play button)
  const resolvedVoiceName = isSelectedCustom
    ? pendingVoiceName ||
      selectedPreset.voiceName ||
      selectedPreset.sessionConfig.voice
    : '';
  const resolvedVoice = resolvedVoiceName
    ? callVoices.find((v) => v.name === resolvedVoiceName)
    : undefined;

  /** The "+" add-character button rendered as an avatar-shaped circle. */
  const addCharacterButton = canAddMore ? (
    <div className="group/card relative flex flex-col items-center gap-2">
      {/* Wrapper matching AvatarButton ring structure for vertical alignment */}
      <div className="rounded-full p-[3px]">
        <div className="rounded-full p-[2px]">
          <PremiumActionButton
            aria-label={dict.addCustomCharacter}
            className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-neutral-600 border-dashed bg-neutral-800/50 text-neutral-400 hover:border-violet-500 hover:text-violet-400 sm:h-16 sm:w-16"
            disabled={isConnected}
            isPaidUser={isPaidUser}
            onClick={handleOpenCreateDialog}
            premiumTooltip={dict.upgradePremiumTooltip}
          >
            <Plus className="h-5 w-5" />
          </PremiumActionButton>
        </div>
      </div>
      <span className="max-w-16 truncate font-medium text-muted-foreground text-xs sm:max-w-20">
        {dict.addCharacterLabel}
      </span>
    </div>
  ) : null;

  return (
    <>
      <div className="w-full">
        {/* Character Avatar Selection */}
        <div className="mb-4 font-semibold text-neutral-400 text-xs uppercase tracking-widest">
          {dict.chooseCharacter}
        </div>

        {/* Avatar Row — Carousel: each avatar is its own slide, 5 visible on mobile / 6 on desktop */}
        <div className="relative mb-4 md:px-10">
          <Carousel opts={{ align: 'start', loop: false, slidesToScroll: 1 }}>
            <CarouselContent className="-ml-2">
              {allCharacters.map((preset) => {
                const isSelected = pgState.selectedPresetId === preset.id;
                const isCustom = isCustomCharacter(preset.id);
                return (
                  <CarouselItem
                    className="basis-1/5 pl-2 sm:basis-1/6"
                    key={preset.id}
                  >
                    <div className="group/card relative flex flex-col items-center">
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
                          aria-label={dict.deleteCharacterAriaLabel.replace(
                            '__NAME__',
                            preset.name,
                          )}
                          className="absolute -top-1 -right-1 z-10 rounded-full bg-destructive p-1 text-destructive-foreground opacity-0 transition-opacity hover:bg-destructive/80 focus:opacity-100 group-hover/card:opacity-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCharacterToDelete({
                              id: preset.id,
                              name: preset.name,
                            });
                            setShowDeleteDialog(true);
                          }}
                          title={dict.deleteCharacterAriaLabel.replace(
                            '__NAME__',
                            preset.name,
                          )}
                          type="button"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </CarouselItem>
                );
              })}
              {/* "+" add button as its own slide */}
              {addCharacterButton && (
                <CarouselItem className="basis-1/5 pl-2 sm:basis-1/6">
                  {addCharacterButton}
                </CarouselItem>
              )}
            </CarouselContent>
            {allCharacters.length + (addCharacterButton ? 1 : 0) > 5 && (
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

        {/* Bio Card - Editable for custom characters */}
        <div
          className={`rounded-xl bg-muted p-4 transition-all duration-300 ${
            selectedPreset
              ? 'translate-y-0 opacity-100'
              : 'pointer-events-none h-0 translate-y-2 overflow-hidden p-0 opacity-0'
          }`}
        >
          {selectedPreset &&
            (isSelectedCustom && !isConnected ? (
              // Editable bio card for custom characters
              <div className="space-y-3">
                {/* Editable Name */}
                <div className="flex items-center gap-2">
                  {isEditingName ? (
                    <Input
                      autoFocus
                      className="h-8 font-semibold"
                      maxLength={50}
                      onBlur={handleSaveNameOrDescription}
                      onChange={(e) => setEditableName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveNameOrDescription();
                        if (e.key === 'Escape') handleCancelEdit();
                      }}
                      value={editableName}
                    />
                  ) : (
                    <button
                      className="group flex items-center gap-1 text-left"
                      onClick={handleStartEditName}
                      type="button"
                    >
                      <span className="font-semibold text-foreground">
                        {selectedPreset.name}
                      </span>
                      <Pencil className="h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </button>
                  )}
                </div>

                {/* Editable Description */}
                <div>
                  {isEditingDescription ? (
                    <Input
                      autoFocus
                      className="h-8 text-sm"
                      maxLength={200}
                      onBlur={handleSaveNameOrDescription}
                      onChange={(e) => setEditableDescription(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveNameOrDescription();
                        if (e.key === 'Escape') handleCancelEdit();
                      }}
                      placeholder={dict.addDescriptionPlaceholder}
                      value={editableDescription}
                    />
                  ) : (
                    <button
                      className="group flex w-full items-start gap-1 text-left"
                      onClick={handleStartEditDescription}
                      type="button"
                    >
                      <span className="text-foreground text-sm">
                        {selectedPreset.localizedDescriptions?.[
                          pgState.language
                        ] ??
                          selectedPreset.localizedDescriptions?.en ??
                          dict.clickToAddDescription}
                      </span>
                      <Pencil className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </button>
                  )}
                </div>

                {/* Voice Selector for Custom Characters */}
                <div className="space-y-2 border-separator1 border-t pt-3">
                  <Label
                    className="text-muted-foreground text-xs"
                    htmlFor="voice-select"
                  >
                    {dict.voiceLabel}
                  </Label>
                  <div className="flex items-center gap-2">
                    <Select
                      disabled={isConnected}
                      onValueChange={handleVoiceChange}
                      value={resolvedVoiceName}
                    >
                      <SelectTrigger className="flex-1" id="voice-select">
                        <SelectValue placeholder={dict.voicePlaceholder} />
                      </SelectTrigger>
                      <SelectContent>
                        {callVoices.map((voice) => (
                          <SelectItem key={voice.id} value={voice.name}>
                            <span className="flex items-center gap-2">
                              <span>{voice.name}</span>
                              {voice.type && (
                                <span className="text-muted-foreground text-xs">
                                  — {voice.type}
                                </span>
                              )}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <VoicePlayButton
                      sampleUrl={resolvedVoice?.sample_url ?? null}
                      size="md"
                      voiceName={resolvedVoiceName}
                    />
                  </div>
                  {resolvedVoice?.description && (
                    <p className="text-muted-foreground text-xs">
                      {resolvedVoice.description}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              // Read-only bio card for predefined characters
              <p className="text-foreground text-sm">
                <span className="font-semibold">{selectedPreset.name}:</span>{' '}
                {selectedPreset.localizedDescriptions?.[pgState.language] ??
                  selectedPreset.localizedDescriptions?.en}
              </p>
            ))}
        </div>
      </div>

      {/* Create Character Dialog */}
      <CreateCharacterDialog
        callVoices={callVoices}
        dict={dict.createCharacter}
        onOpenChange={setShowCreateDialog}
        onSave={handleCreateCharacter}
        open={showCreateDialog}
      />

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
