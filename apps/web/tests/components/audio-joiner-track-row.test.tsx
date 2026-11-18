// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TrackRow } from '@/app/[lang]/tools/audio-joiner/components/track-row';

vi.mock('@wavesurfer/react', () => ({ default: () => null }));

function renderTrackRow(
  props: { disabled?: boolean; endSec?: number; startSec?: number } = {},
) {
  const onTrimChange = vi.fn();
  render(
    <TrackRow
      canMoveDown={false}
      canMoveUp={false}
      durationSec={10}
      endSec={8}
      name="clip.mp3"
      onDelete={vi.fn()}
      onMoveDown={vi.fn()}
      onMoveUp={vi.fn()}
      onReady={vi.fn()}
      onTrimChange={onTrimChange}
      startSec={2}
      url="blob:clip"
      {...props}
    />,
  );
  return {
    end: screen.getByRole('slider', { name: 'Trim end' }),
    onTrimChange,
    start: screen.getByRole('slider', { name: 'Trim start' }),
  };
}

afterEach(cleanup);

describe('audio joiner TrackRow trim handles', () => {
  it('exposes both handles as focusable sliders bounded by each other', () => {
    const { start, end } = renderTrackRow();

    expect(start.tagName).toBe('DIV');
    expect(start).toHaveAttribute('tabindex', '0');
    expect(start).toHaveAttribute('aria-valuenow', '2');
    expect(start).toHaveAttribute('aria-valuetext', '0:02.0');
    expect(start).toHaveAttribute('aria-valuemin', '0');
    expect(start).toHaveAttribute('aria-valuemax', '7.95');
    expect(end).toHaveAttribute('tabindex', '0');
    expect(end).toHaveAttribute('aria-valuenow', '8');
    expect(end).toHaveAttribute('aria-valuemin', '2.05');
    expect(end).toHaveAttribute('aria-valuemax', '10');
  });

  it('moves the start handle with arrow keys, Shift and Home', () => {
    const { start, onTrimChange } = renderTrackRow();

    fireEvent.keyDown(start, { key: 'ArrowRight' });
    expect(onTrimChange).toHaveBeenLastCalledWith(2.1, 8);

    fireEvent.keyDown(start, { key: 'ArrowLeft', shiftKey: true });
    expect(onTrimChange).toHaveBeenLastCalledWith(1, 8);

    fireEvent.keyDown(start, { key: 'Home' });
    expect(onTrimChange).toHaveBeenLastCalledWith(0, 8);
  });

  it('keeps the end handle within the track and after the start', () => {
    const { end, onTrimChange } = renderTrackRow();

    fireEvent.keyDown(end, { key: 'End' });
    expect(onTrimChange).toHaveBeenLastCalledWith(2, 10);

    fireEvent.keyDown(end, { key: 'Home' });
    expect(onTrimChange).toHaveBeenLastCalledWith(2, 2.05);
  });

  it('skips moves that leave the trim unchanged', () => {
    const { start, end, onTrimChange } = renderTrackRow({
      endSec: 10,
      startSec: 0,
    });

    fireEvent.keyDown(start, { key: 'Home' });
    fireEvent.keyDown(start, { key: 'ArrowLeft' });
    fireEvent.keyDown(end, { key: 'End' });
    fireEvent.keyDown(end, { key: 'ArrowRight' });

    expect(onTrimChange).not.toHaveBeenCalled();
  });

  it('ignores unrelated keys', () => {
    const { start, onTrimChange } = renderTrackRow();

    fireEvent.keyDown(start, { key: 'Enter' });
    expect(onTrimChange).not.toHaveBeenCalled();
  });

  it('removes the handles from the tab order while disabled', () => {
    const { start, onTrimChange } = renderTrackRow({ disabled: true });

    expect(start).toHaveAttribute('tabindex', '-1');
    fireEvent.keyDown(start, { key: 'ArrowRight' });
    expect(onTrimChange).not.toHaveBeenCalled();
  });
});
