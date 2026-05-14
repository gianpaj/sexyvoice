import { describe, expect, it } from 'vitest';

import { splitLongTextIntoSegments } from '@/components/audio-generator/split-segments-utils';

describe('splitLongTextIntoSegments', () => {
  it('keeps Grok wrapped tags intact while packing following plain sentences', () => {
    const prompt = `The mission was supposed to be simple.[pause]
A relay station inside a cathedral on the eastern ridge, one of Lilith's communication towers feeding signals to three occupied districts.[pause]
Take it down, go dark, be back before sunrise. It was the kind of operation the team had run countless times since the occupation began.[pause]
Clean in, clean out, no engagement unless forced.[long-pause]
<emphasis>Unfortunately for your team she was waiting.</emphasis>[long-pause]
Not her lieutenants, not her ground units <lower-pitch>Lilith herself,</lower-pitch> stood in the center of the cathedral.`;

    const segments = splitLongTextIntoSegments(`${prompt} ${prompt}`, {
      preserveGrokWrappingTags: true,
    });

    expect(segments).toHaveLength(3);
    expect(segments[1]).toContain(
      '<lower-pitch>Lilith herself,</lower-pitch> stood in the center of the cathedral.',
    );
    expect(segments[1]).toContain('The mission was supposed to be simple.');
    expect(segments[1]).not.toBe(
      '[long-pause]\nNot her lieutenants, not her ground units <lower-pitch>Lilith herself,</lower-pitch>',
    );
    expect(segments.join(' ')).toContain(
      '<emphasis>Unfortunately for your team she was waiting.</emphasis>',
    );
  });
});
