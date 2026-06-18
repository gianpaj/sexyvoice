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

    expect(
      shouldDropClientSentryEvent({
        exception: {
          values: [
            {
              type: 'TypeError',
              value: "Cannot read properties of null (reading 'tagName')",
              stacktrace: {
                frames: [
                  {
                    filename: 'app:///_next/static/chunks/app/page.js',
                    function: 'renderTag',
                  },
                ],
              },
            },
          ],
        },
      }),
    ).toBe(false);
  });

  it('drops message-only React DOM mutation noise', () => {
    expect(
      shouldDropClientSentryEvent({
        message: "Cannot read properties of null (reading 'removeChild')",
      }),
    ).toBe(true);
  });

  it('drops recoverable hydration and RSC connection messages', () => {
    expect(
      shouldDropClientSentryEvent({
        message:
          "Hydration failed because the server rendered HTML didn't match the client.",
      }),
    ).toBe(true);
    expect(shouldDropClientSentryEvent({ message: 'Hydration Error' })).toBe(
      true,
    );
    expect(shouldDropClientSentryEvent({ message: 'Connection closed.' })).toBe(
      true,
    );
  });

  it('drops PostHog recorder security errors', () => {
    expect(
      shouldDropClientSentryEvent({
        exception: {
          values: [
            {
              type: 'SecurityError',
              value: "Permission to call 'get parentNode' denied.",
              stacktrace: {
                frames: [
                  {
                    filename: 'app:///seguimiento/static/posthog-recorder.js',
                    function: 'parentNode',
                  },
                ],
              },
            },
          ],
        },
      }),
    ).toBe(true);
  });

  it('drops injected script tagName errors without dropping app tagName errors', () => {
    expect(
      shouldDropClientSentryEvent({
        exception: {
          values: [
            {
              type: 'TypeError',
              value: "Cannot read properties of null (reading 'tagName')",
              stacktrace: {
                frames: [
                  {
                    filename: '<anonymous>',
                    function: 'addEL_hook',
                  },
                ],
              },
            },
          ],
        },
      }),
    ).toBe(true);

    expect(
      shouldDropClientSentryEvent({
        exception: {
          values: [
            {
              type: 'TypeError',
              value: "Cannot read properties of null (reading 'tagName')",
              stacktrace: {
                frames: [
                  {
                    filename: 'apps/web/components/example.tsx',
                    function: 'renderTag',
                  },
                ],
              },
            },
          ],
        },
      }),
    ).toBe(false);
  });

  it('drops browser media and opaque event rejections without app frames', () => {
    expect(
      shouldDropClientSentryEvent({
        exception: {
          values: [
            {
              type: 'InvalidAccessError',
              value: 'Track has ended',
              stacktrace: {
                frames: [
                  { filename: '[native code]', function: 'applyConstraints' },
                ],
              },
            },
          ],
        },
      }),
    ).toBe(true);

    expect(
      shouldDropClientSentryEvent({
        exception: {
          values: [
            {
              type: 'Event',
              value: 'Event `Event` (type=error) captured as promise rejection',
            },
          ],
        },
      }),
    ).toBe(true);
  });

  it('drops injected browser globals and external worker imports without app frames', () => {
    expect(
      shouldDropClientSentryEvent({
        exception: {
          values: [
            {
              type: 'ReferenceError',
              value: "Can't find variable: __firefox__",
              stacktrace: {
                frames: [{ filename: 'app:///en', function: 'global code' }],
              },
            },
          ],
        },
      }),
    ).toBe(true);

    expect(
      shouldDropClientSentryEvent({
        exception: {
          values: [
            {
              type: 'TypeError',
              value:
                "undefined is not an object (evaluating 'window.ethereum.selectedAddress = undefined')",
              stacktrace: {
                frames: [{ filename: 'app:///en', function: 'global code' }],
              },
            },
          ],
        },
      }),
    ).toBe(true);

    expect(
      shouldDropClientSentryEvent({
        exception: {
          values: [
            {
              value:
                "Uncaught NetworkError: Failed to execute 'importScripts' on 'WorkerGlobalScope': The script at 'https://propertydealersinindia.org/tojy/elha.wasm.wasm' failed to load.",
            },
          ],
        },
      }),
    ).toBe(true);
  });

  it('does not drop injected browser global text with app frames', () => {
    expect(
      shouldDropClientSentryEvent({
        exception: {
          values: [
            {
              type: 'TypeError',
              value:
                "undefined is not an object (evaluating 'window.ethereum.selectedAddress = undefined')",
              stacktrace: {
                frames: [
                  {
                    filename: 'apps/web/components/wallet-button.tsx',
                    function: 'connectWallet',
                  },
                ],
              },
            },
          ],
        },
      }),
    ).toBe(false);
  });

  it('drops WebView bridge and transient network noise without app frames', () => {
    expect(
      shouldDropClientSentryEvent({
        exception: {
          values: [
            {
              type: 'Error',
              value: 'WKWebView API client did not respond to this postMessage',
            },
          ],
        },
      }),
    ).toBe(true);

    expect(
      shouldDropClientSentryEvent({
        exception: {
          values: [
            {
              type: 'TypeError',
              value: 'network error',
              stacktrace: {
                frames: [{ filename: '[native code]', function: 'fetch' }],
              },
            },
          ],
        },
      }),
    ).toBe(true);
  });
});
