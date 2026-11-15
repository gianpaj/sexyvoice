'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

import { type Character, deleteCharacter } from '@/lib/calls/characters';
import { useCallSetup } from './call-setup';

const DELETE_UNDO_MS = 6000;

interface PendingDelete {
  character: Character;
  index: number;
  toastId: number | string;
}

/**
 * Removes a custom character from the list at once and sends the DELETE when
 * its Undo toast closes on its own or is dismissed. The toast's timer pauses
 * while it is hovered, so Undo stays valid for as long as it is visible.
 * Leaving the page sends every pending delete. A failed delete puts the
 * character back.
 */
export function useDeferredCharacterDelete() {
  const { customCharacters, removeCharacter, restoreCharacter } =
    useCallSetup();
  const t = useTranslations('call.picker');
  const pending = useRef(new Map<string, PendingDelete>());

  const take = (id: string) => {
    const entry = pending.current.get(id);
    pending.current.delete(id);
    return entry;
  };

  const commit = async (id: string) => {
    const entry = take(id);
    if (!entry) return;
    const ok = await deleteCharacter(id)
      .then((response) => response.ok)
      .catch(() => false);
    if (!ok) {
      restoreCharacter(entry.character, entry.index);
      toast.error(t('deleteFailed', { name: entry.character.name }));
    }
  };

  const undo = (id: string) => {
    const entry = take(id);
    if (!entry) return;
    restoreCharacter(entry.character, entry.index);
    toast.success(t('restored', { name: entry.character.name }));
  };

  const remove = (character: Character) => {
    const index = customCharacters.findIndex(({ id }) => id === character.id);
    if (index < 0) return;
    removeCharacter(character.id);
    const toastId = toast(t('deleted', { name: character.name }), {
      action: { label: t('undo'), onClick: () => undo(character.id) },
      duration: DELETE_UNDO_MS,
      onAutoClose: () => commit(character.id),
      onDismiss: () => commit(character.id),
    });
    pending.current.set(character.id, { character, index, toastId });
  };

  /**
   * Sends every pending delete now. Creating a character first frees its
   * slot, since the server counts characters still waiting to be deleted.
   */
  const flush = () => {
    for (const entry of pending.current.values()) {
      toast.dismiss(entry.toastId);
    }
  };

  useEffect(() => {
    const flush = () => {
      for (const id of pending.current.keys()) {
        deleteCharacter(id).catch(() => undefined);
      }
      pending.current.clear();
    };
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, []);

  return { flush, remove };
}
