'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { callMemoryPreference } from '@/lib/calls/memory';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

export function MemorySettingForm({
  initialEnabled,
}: {
  initialEnabled: boolean;
}) {
  const t = useTranslations('profile.memory');
  const [enabled, setEnabled] = useState(initialEnabled);
  const [isSaving, setIsSaving] = useState(false);

  const updateMemory = async (checked: boolean) => {
    setIsSaving(true);
    try {
      const { error } = await getSupabaseBrowserClient().auth.updateUser({
        data: callMemoryPreference(checked),
      });
      if (error) {
        throw error;
      }
      setEnabled(checked);
      toast.success(t('settingSaved'));
    } catch {
      toast.error(t('settingError'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      aria-busy={isSaving}
      className="flex min-h-11 items-center justify-between gap-4"
    >
      <Label
        className="flex min-h-11 flex-1 items-center"
        htmlFor="call-memory"
      >
        {t('settingLabel')}
      </Label>
      <Switch
        checked={enabled}
        disabled={isSaving}
        id="call-memory"
        onCheckedChange={updateMemory}
      />
    </div>
  );
}
