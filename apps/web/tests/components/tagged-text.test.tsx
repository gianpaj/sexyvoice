// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { TAG_CHIP_CLASS } from '@/components/speech-tags/catalog';
import { TaggedText } from '@/components/speech-tags/tagged-text';

afterEach(cleanup);

describe('TaggedText', () => {
  it('renders Grok instant and wrapper tags as editor chips by default', () => {
    const text = '[sigh] <soft>Hello</soft>';
    render(<TaggedText text={text} />);
    for (const tag of ['[sigh]', '<soft>', '</soft>']) {
      expect(screen.getByText(tag, { exact: true })).toHaveClass(
        ...TAG_CHIP_CLASS.split(' '),
      );
    }
  });

  it('renders Voxtral tags with the supplied styling and exact spacing', () => {
    const text = "Oh, [emotion=calm][pace=slow]you're here.";
    const { container } = render(
      <TaggedText className="text-primary" provider="voxtral" text={text} />,
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
    const { container } = render(<TaggedText text={text} />);
    expect(container.textContent).toBe(text);
    expect(container.querySelector('.bg-muted')).toBeNull();
  });
});
