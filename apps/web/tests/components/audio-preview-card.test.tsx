// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AudioPreviewCard } from '@/components/audio-preview-card';

describe('AudioPreviewCard', () => {
  it('highlights instant tags in the prompt preview', () => {
    render(
      <AudioPreviewCard
        audioSrc="https://files.sexyvoice.ai/sample.mp3"
        dir="ltr"
        lang="en"
        name="Sal"
        prompt="Life is like a box of chocolates, [laugh] you never know what you're gonna get."
      />,
    );

    expect(screen.getByText('[laugh]')).toHaveClass('bg-muted', 'font-mono');
  });

  it('highlights wrapping tags while keeping the wrapped text visible', () => {
    render(
      <AudioPreviewCard
        audioSrc="https://files.sexyvoice.ai/sample.mp3"
        dir="ltr"
        lang="en"
        name="Ara"
        prompt="<emphasis>Unfortunately for your team she was waiting.</emphasis>[long-pause]"
      />,
    );

    expect(screen.getByText('<emphasis>')).toHaveClass('bg-muted', 'font-mono');
    expect(screen.getByText('</emphasis>')).toHaveClass(
      'bg-muted',
      'font-mono',
    );
    expect(screen.getByText('[long-pause]')).toHaveClass(
      'bg-muted',
      'font-mono',
    );
    expect(
      screen.getByText('Unfortunately for your team she was waiting.'),
    ).toBeInTheDocument();
  });
});
