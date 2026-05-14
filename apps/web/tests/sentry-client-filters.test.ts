import { describe, expect, it } from 'vitest';

import { shouldDropClientSentryEvent } from '@/lib/sentry/client-filters';

describe('shouldDropClientSentryEvent', () => {
  it('drops React commit-phase removeChild NotFoundError events', () => {
    expect(
      shouldDropClientSentryEvent({
        exception: {
          values: [
            {
              type: 'NotFoundError',
              value:
                "Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node.",
              stacktrace: {
                frames: [
                  {
                    filename:
                      'node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.production.js',
                    function: 'commitDeletionEffectsOnFiber',
                  },
                ],
              },
            },
          ],
        },
      }),
    ).toBe(true);
  });

  it('keeps unrelated NotFoundError events', () => {
    expect(
      shouldDropClientSentryEvent({
        exception: {
          values: [
            {
              type: 'NotFoundError',
              value: 'Microphone input device was not found.',
              stacktrace: {
                frames: [
                  {
                    filename: 'https://sexyvoice.ai/_next/static/app.js',
                    function: 'connectCall',
                  },
                ],
              },
            },
          ],
        },
      }),
    ).toBe(false);
  });
});
