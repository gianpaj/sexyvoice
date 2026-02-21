'use client';

import Image from 'next/image';

interface DemoCharacterAvatarProps {
  image: string;
  name: string;
  isSpeaking: boolean;
  energy: number;
  accentGradient: string;
}

/**
 * Animated avatar with energy-driven speaking pulse ring and glow effect.
 *
 * When `isSpeaking` is true:
 * - Ring scale is driven by `energy`: `scale(1 + energy * 0.1)` for natural pulse.
 * - Glow effect: box-shadow spread and opacity scaled by energy, using accent color.
 *
 * When not speaking: static ring, no glow.
 * Uses CSS `transition` (not `animation`) for smooth entry/exit.
 */
export function DemoCharacterAvatar({
  image,
  name,
  isSpeaking,
  energy,
  accentGradient,
}: DemoCharacterAvatarProps) {
  // Clamp energy to 0–1
  const e = Math.max(0, Math.min(1, energy));

  const ringScale = isSpeaking ? 1 + e * 0.1 : 1;
  const glowOpacity = isSpeaking ? 0.3 + e * 0.5 : 0;
  const glowSpread = isSpeaking ? 4 + Math.round(e * 16) : 0;

  return (
    <div className="relative flex flex-col items-center gap-2">
      {/* Outer ring with gradient + energy-driven scale/glow */}
      <div
        className={`relative rounded-full bg-gradient-to-tr ${accentGradient} p-[3px]`}
        style={{
          transform: `scale(${ringScale})`,
          boxShadow: isSpeaking
            ? `0 0 ${glowSpread}px ${glowSpread / 2}px rgba(168, 85, 247, ${glowOpacity})`
            : 'none',
          transition: 'transform 120ms ease-out, box-shadow 120ms ease-out',
        }}
      >
        {/* Inner background ring (gap between gradient ring and image) */}
        <div className="rounded-full bg-background p-[2px]">
          {/* Avatar image */}
          <div className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-neutral-800 sm:h-24 sm:w-24">
            <Image
              alt={name}
              className="object-cover"
              fill
              priority
              sizes="(max-width: 640px) 80px, 96px"
              src={`/characters/${image}`}
            />
          </div>
        </div>
      </div>

      {/* Character name */}
      <span className="font-medium text-foreground text-sm">{name}</span>
    </div>
  );
}
