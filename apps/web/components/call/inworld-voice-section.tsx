'use client';

import { useConnectionState } from '@livekit/components-react';
import { ConnectionState } from 'livekit-client';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { CloneInworldVoiceSelect } from '@/app/[lang]/(dashboard)/dashboard/clone/clone-inworld-voice-select';
import type {
  AudioReference,
  AudioReferenceSelection,
} from '@/app/[lang]/(dashboard)/dashboard/clone/clone-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePlaygroundState } from '@/hooks/use-playground-state';

const ALLOWED_TYPES =
  'audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/x-wav,audio/m4a,audio/x-m4a,audio/opus,audio/x-opus,.opus';

interface AudioReferenceRow {
  created_at: string | null;
  id: string;
  is_paid: boolean;
  name: string;
  provider: string;
  voice_id: string;
}

export function InworldVoiceSection() {
  const t = useTranslations('call');
  const { pgState, dispatch } = usePlaygroundState();
  const connectionState = useConnectionState();
  const disabled = connectionState === ConnectionState.Connected;

  const [voices, setVoices] = useState<AudioReference[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const selected: AudioReferenceSelection =
    pgState.sessionConfig.audioReferenceId ?? 'new';

  const setAudioReferenceId = useCallback(
    (id: string | null) => {
      dispatch({
        type: 'SET_SESSION_CONFIG',
        payload: { audioReferenceId: id },
      });
    },
    [dispatch],
  );

  const loadVoices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/audio-references?provider=inworld');
      if (!res.ok) {
        throw new Error('Failed to load voices');
      }
      const json = (await res.json()) as { data: AudioReferenceRow[] };
      setVoices(
        (json.data ?? []).map((row) => ({
          id: row.id,
          provider: row.provider,
          voiceId: row.voice_id,
          name: row.name,
          isPaid: row.is_paid,
          createdAt: row.created_at,
        })),
      );
    } catch (error) {
      console.error('Failed to load Inworld voices:', error);
      toast.error(t('inworldVoiceLoadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadVoices().catch(() => undefined);
  }, [loadVoices]);

  const handleChange = (value: AudioReferenceSelection) => {
    setAudioReferenceId(value === 'new' ? null : value);
  };

  const handleVoiceDeleted = () => {
    setAudioReferenceId(null);
    loadVoices().catch(() => undefined);
  };

  const handleCreate = async () => {
    if (!(file && name.trim())) {
      return;
    }

    setCreating(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('name', name.trim());
      // Reference language defaults to English for the call-page uploader.
      formData.append('locale', 'en');

      const res = await fetch('/api/audio-references', {
        method: 'POST',
        body: formData,
      });
      const json = (await res.json()) as {
        data?: AudioReferenceRow;
        error?: string;
      };

      if (!(res.ok && json.data)) {
        throw new Error(json.error || 'Failed to create voice');
      }

      await loadVoices();
      setAudioReferenceId(json.data.id);
      setName('');
      setFile(null);
      toast.success(t('inworldVoiceCreated'));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t('inworldVoiceCreateError'),
      );
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-separator1 bg-muted/30 p-3">
      <div className="font-semibold text-neutral-400 text-xs uppercase tracking-widest">
        {t('inworldVoiceLabel')}
      </div>

      <CloneInworldVoiceSelect
        disabled={disabled}
        loading={loading}
        onChange={handleChange}
        onVoiceDeleted={handleVoiceDeleted}
        value={selected}
        voices={voices}
      />

      {selected === 'new' && (
        <div className="space-y-2">
          <Label htmlFor="inworld-call-voice-name">
            {t('inworldVoiceNameLabel')}
          </Label>
          <Input
            disabled={disabled}
            id="inworld-call-voice-name"
            maxLength={60}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('inworldVoiceNamePlaceholder')}
            value={name}
          />
          <Input
            accept={ALLOWED_TYPES}
            disabled={disabled}
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            type="file"
          />
          <Button
            disabled={disabled || creating || !file || !name.trim()}
            onClick={handleCreate}
            type="button"
          >
            {creating
              ? `${t('inworldVoiceCreate')}...`
              : t('inworldVoiceCreate')}
          </Button>
        </div>
      )}
    </div>
  );
}
