import { describe, expect, it } from 'vitest';

import {
  SPLIT_SEGMENT_MAX_LENGTH,
  splitLongTextIntoSegments,
} from '@/components/audio-generator/split-segments-utils';

function expectSegmentsWithinLimit(segments: string[]) {
  for (const segment of segments) {
    expect(segment.length).toBeLessThanOrEqual(SPLIT_SEGMENT_MAX_LENGTH);
  }
}

describe('splitLongTextIntoSegments', () => {
  it('splits and packs punctuation-terminated sentences without exceeding the segment limit', () => {
    const firstSentence = `${'A'.repeat(220)}.`;
    const secondSentence = `${'B'.repeat(220)}?`;
    const thirdSentence = `${'C'.repeat(220)}!`;
    const fourthSentence = `${'D'.repeat(220)}.`;

    const segments = splitLongTextIntoSegments(
      [firstSentence, secondSentence, thirdSentence, fourthSentence].join(' '),
    );

    expect(segments).toEqual([
      `${firstSentence} ${secondSentence}`,
      `${thirdSentence} ${fourthSentence}`,
    ]);
    expectSegmentsWithinLimit(segments);
  });

  it('keeps no-punctuation text as one segment when it fits under the segment limit', () => {
    const text =
      'This is a long text with no punctuation and it should stay as one segment';

    expect(splitLongTextIntoSegments(text)).toEqual([text]);
  });

  it('hard chunks a single sentence that exceeds the segment limit', () => {
    const text = `${'a'.repeat(SPLIT_SEGMENT_MAX_LENGTH + 100)} end.`;

    const segments = splitLongTextIntoSegments(text);

    expect(segments).toHaveLength(2);
    expect(segments.join('')).toBe(text);
    expectSegmentsWithinLimit(segments);
  });

  it('normalizes blank lines and surrounding whitespace while preserving sentence content', () => {
    const segments = splitLongTextIntoSegments(`
      First line with spaces.  

      Second line after blank line?
          Third line with indentation!    
    `);

    expect(segments).toEqual([
      'First line with spaces. Second line after blank line? Third line with indentation!',
    ]);
  });

  it('does not return oversized segments for representative plain-text inputs', () => {
    const inputs = [
      '',
      'Short.',
      '   Trim me.   ',
      'A'.repeat(SPLIT_SEGMENT_MAX_LENGTH * 3 + 10),
      [
        `${'A'.repeat(200)}.`,
        `${'B'.repeat(200)}.`,
        `${'C'.repeat(200)}.`,
      ].join(' '),
    ];

    for (const input of inputs) {
      expectSegmentsWithinLimit(splitLongTextIntoSegments(input));
    }
  });

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
