// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { JoinControls } from '@/app/[lang]/tools/audio-joiner/components/join-controls';

describe('JoinControls', () => {
  it('names the format select with its visible label', () => {
    render(
      <JoinControls
        canJoin
        isPlaying={false}
        isProcessing={false}
        labels={{
          cancel: 'Cancel',
          format: 'Format',
          join: 'Join',
          joining: 'Joining...',
          pause: 'Pause',
          play: 'Play',
        }}
        onCancel={vi.fn()}
        onJoin={vi.fn()}
        onOutputFormatChange={vi.fn()}
        onTogglePlayPause={vi.fn()}
        outputFormat="mp3"
      />,
    );

    expect(screen.getByRole('combobox', { name: 'Format' })).toHaveTextContent(
      'MP3',
    );
  });
});
