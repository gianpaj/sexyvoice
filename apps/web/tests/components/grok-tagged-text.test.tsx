// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { GrokTaggedText } from '@/components/grok-tagged-text';

afterEach(cleanup);

describe('GrokTaggedText', () => {
  it('keeps Grok instant and wrapper tags highlighted by default', () => {
    const text = '[sigh] <soft>Hello</soft>';
    render(<GrokTaggedText text={text} />);
    for (const tag of ['[sigh]', '<soft>', '</soft>']) {
      expect(screen.getByText(tag, { exact: true })).toHaveClass('bg-gray-700');
    }
  });

  it('renders Voxtral tags with the supplied styling and exact spacing', () => {
    const text = "Oh, [emotion=calm][pace=slow]you're here.";
    const { container } = render(
      <GrokTaggedText
        className="text-primary"
        provider="voxtral"
        text={text}
      />,
    );
    for (const tag of ['[emotion=calm]', '[pace=slow]']) {
      expect(screen.getByText(tag, { exact: true })).toHaveClass(
        'text-primary',
      );
    }
    expect(container.textContent).toBe(text);
  });

  it('does not highlight unsupported tags for the selected provider', () => {
    const text = '[emotion=calm]Hello';
    const { container } = render(<GrokTaggedText text={text} />);
    expect(container.textContent).toBe(text);
    expect(container.querySelector('.bg-gray-700')).toBeNull();
  });
});
