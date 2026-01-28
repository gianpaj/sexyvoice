'use client';

import { Headphones } from 'lucide-react';

import type { PresetIconId } from '@/data/presets';

const iconMap: Record<
  PresetIconId,
  React.ComponentType<{ className?: string }>
> = {
  headphones: Headphones,
};

export function getPresetIcon(
  iconId?: PresetIconId,
): React.ComponentType<{ className?: string }> | undefined {
  if (!iconId) return;
  return iconMap[iconId];
}

export function PresetIcon({
  iconId,
  className,
}: {
  iconId?: PresetIconId;
  className?: string;
}) {
  const Icon = getPresetIcon(iconId);
  if (!Icon) return null;
  return <Icon className={className} />;
}
