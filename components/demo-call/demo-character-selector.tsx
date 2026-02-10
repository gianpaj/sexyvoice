'use client';

import Image from 'next/image';

import { defaultPresets } from '@/data/presets';

interface DemoCharacterSelectorProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
  disabled: boolean;
}

const characterPresets = defaultPresets.filter((preset) => preset.image);

export function DemoCharacterSelector({
  selectedId,
  onSelect,
  disabled,
}: DemoCharacterSelectorProps) {
  const selectedPreset = characterPresets.find((p) => p.id === selectedId);

  return (
    <div className="w-full">
      <div className="mb-3 text-center font-semibold text-neutral-400 text-xs uppercase tracking-widest">
        Try a demo call
      </div>

      <div className="mb-4 flex justify-center gap-4">
        {characterPresets.map((preset) => {
          const isSelected = selectedId === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onSelect(preset.id)}
              disabled={disabled}
              className="group flex flex-col items-center gap-2"
              aria-pressed={isSelected}
            >
              <div
                className={`relative rounded-full p-[3px] transition-all duration-300 ${
                  isSelected
                    ? 'bg-gradient-to-tr from-violet-500 via-purple-500 to-fuchsia-500'
                    : 'bg-transparent'
                } ${disabled ? '' : 'group-hover:scale-105'}`}
              >
                <div className="rounded-full bg-background p-[2px]">
                  <div className="relative h-14 w-14 overflow-hidden rounded-full bg-neutral-800 sm:h-16 sm:w-16">
                    {preset.image && (
                      <Image
                        src={`/characters/${preset.image}`}
                        alt={preset.name}
                        fill
                        className={`object-cover transition-all duration-300 ${
                          disabled && !isSelected
                            ? 'opacity-40 grayscale'
                            : ''
                        }`}
                      />
                    )}
                  </div>
                </div>
              </div>

              <span
                className={`font-medium text-xs transition-colors ${
                  isSelected ? 'text-foreground' : 'text-muted-foreground'
                } ${disabled && !isSelected ? 'opacity-40' : ''}`}
              >
                {preset.name}
              </span>
            </button>
          );
        })}
      </div>

      <div
        className={`rounded-xl bg-muted p-3 transition-all duration-300 ${
          selectedPreset
            ? 'translate-y-0 opacity-100'
            : 'pointer-events-none h-0 translate-y-2 overflow-hidden p-0 opacity-0'
        }`}
      >
        {selectedPreset && (
          <p className="text-center text-foreground text-sm">
            <span className="font-semibold">{selectedPreset.name}:</span>{' '}
            {selectedPreset.description}
          </p>
        )}
      </div>
    </div>
  );
}
