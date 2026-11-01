import { Play, Square } from 'lucide-react';

import { cn } from '@/lib/utils';

/** Four static bars that mark a sample as playing. */
export function PlayingBars({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('inline-flex h-3.5 items-end gap-0.5', className)}
    >
      {['h-1.5', 'h-[13px]', 'h-[9px]', 'h-3'].map((height) => (
        <span
          className={cn('w-[3px] rounded-sm bg-violet-300', height)}
          key={height}
        />
      ))}
    </span>
  );
}

interface ListenButtonProps {
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
  /** Visible text; omit for the round icon-only button. */
  label?: string;
  onClick: () => void;
  playing: boolean;
}

export function ListenButton({
  ariaLabel,
  className,
  disabled,
  label,
  onClick,
  playing,
}: ListenButtonProps) {
  const Icon = playing ? Square : Play;
  return (
    <button
      aria-label={ariaLabel}
      aria-pressed={playing}
      className={cn(
        'inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full border border-slate-700/70 bg-slate-800/60 font-medium text-slate-200 text-sm transition-colors hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-violet-400 disabled:pointer-events-none disabled:opacity-50',
        label ? 'pr-4 pl-3.5' : 'w-11',
        className,
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <Icon aria-hidden="true" className="size-3.5 fill-current" />
      {label && <span>{label}</span>}
    </button>
  );
}
