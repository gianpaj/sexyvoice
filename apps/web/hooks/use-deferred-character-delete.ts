'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

import type { Preset } from '@/data/presets';
import { usePlaygroundState } from './use-playground-state';

export const DELETE_UNDO_MS = 6000;

interface PendingDelete {
  index: number;
  preset: Preset;
}

const sendDelete = (id: string) =>
  fetch('/api/characters', {
    body: JSON.stringify({ id }),
    headers: { 'Content-Type': 'application/json' },
    // Lets a delete sent from `pagehide` finish after the page is gone.
    keepalive: true,
    method: 'DELETE',
  });

/**
 * Removes a custom character from the list at once and sends the DELETE when
 * its Undo toast closes on its own or is dismissed. The toast's timer pauses
 * while it is hovered, so Undo stays valid for as long as it is visible.
 * Leaving the page sends every pending delete. A failed delete puts the
 * character back.
 */
export function useDeferredCharacterDelete() {
  const { pgState, dispatch, helpers, selectPreset } = usePlaygroundState();
  const t = useTranslations('call.picker');
  const pending = useRef(new Map<string, PendingDelete>());

  const take = (id: string) => {
    const entry = pending.current.get(id);
    pending.current.delete(id);
    return entry;
  };

  const restore = (entry: PendingDelete) =>
    dispatch({
      payload: { index: entry.index, preset: entry.preset },
      type: 'RESTORE_CUSTOM_CHARACTER',
    });

  const commit = async (id: string) => {
    const entry = take(id);
    if (!entry) return;
    const ok = await sendDelete(id)
      .then((response) => response.ok)
      .catch(() => false);
    if (!ok) {
      restore(entry);
      toast.error(t('deleteFailed', { name: entry.preset.name }));
    }
  };

  const undo = (id: string) => {
    const entry = take(id);
    if (!entry) return;
    restore(entry);
    toast.success(t('restored', { name: entry.preset.name }));
  };

  const remove = (preset: Preset) => {
    const index = pgState.customCharacters.findIndex((c) => c.id === preset.id);
    if (index < 0) return;
    dispatch({ payload: preset.id, type: 'DELETE_CUSTOM_CHARACTER' });
    if (pgState.selectedPresetId === preset.id) {
      selectPreset(helpers.getDefaultPresets()[0]?.id ?? null);
    }
    pending.current.set(preset.id, { index, preset });
    toast(t('deleted', { name: preset.name }), {
      action: { label: t('undo'), onClick: () => undo(preset.id) },
      duration: DELETE_UNDO_MS,
      onAutoClose: () => commit(preset.id),
      onDismiss: () => commit(preset.id),
    });
  };

  useEffect(() => {
    const flush = () => {
      for (const id of pending.current.keys()) {
        sendDelete(id).catch(() => undefined);
      }
      pending.current.clear();
    };
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, []);

  return { remove };
}
