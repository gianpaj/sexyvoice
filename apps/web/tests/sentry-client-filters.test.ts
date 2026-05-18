import { describe, expect, it } from 'vitest';

import { shouldDropClientSentryEvent } from '@/lib/sentry/client-filters';

describe('shouldDropClientSentryEvent', () => {
  it('drops known React DOM mutation noise with React internals frames', () => {
    expect(
      shouldDropClientSentryEvent({
        exception: {
          values: [
            {
              type: 'NotFoundError',
              value:
                "Failed to execute 'insertBefore' on 'Node': The node before which the new node is to be inserted is not a child of this node.",
              stacktrace: {
                frames: [
                  {
                    filename: 'react-dom-client.production.js',
                    function: 'commitMutationEffectsOnFiber',
                  },
                ],
              },
            },
          ],
        },
      }),
    ).toBe(true);
  });

  it('does not drop app exceptions that only look superficially similar', () => {
    expect(
      shouldDropClientSentryEvent({
        exception: {
          values: [
            {
              type: 'Error',
              value:
                "Failed to execute 'insertBefore' on 'Node': The node before which the new node is to be inserted is not a child of this node.",
              stacktrace: {
                frames: [
                  {
                    filename: 'apps/web/components/example.tsx',
                    function: 'insertUserNode',
                  },
                ],
              },
            },
          ],
        },
      }),
    ).toBe(false);
  });

  it('drops recoverable hydration and RSC connection messages', () => {
    expect(shouldDropClientSentryEvent({ message: 'Hydration Error' })).toBe(
      true,
    );
    expect(shouldDropClientSentryEvent({ message: 'Connection closed.' })).toBe(
      true,
    );
  });
});
