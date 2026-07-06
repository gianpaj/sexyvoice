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

    expect(
      shouldDropClientSentryEvent({
        exception: {
          values: [
            {
              type: 'NotFoundError',
              value: 'The object can not be found here.',
              stacktrace: {
                frames: [
                  {
                    filename: 'react-dom-client.production.js',
                    function: 'commitDeletionEffectsOnFiber',
                  },
                  {
                    filename: '[native code]',
                    function: 'removeChild',
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

  it('drops known DOM mutation noise with unsymbolicated non-app frames', () => {
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
                      'https://sexyvoice.ai/_next/static/chunks/1234.js',
                    function: 'rZ',
                  },
                ],
              },
            },
          ],
        },
      }),
    ).toBe(true);
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

  it('drops framework-only Next client transient exceptions', () => {
    expect(
      shouldDropClientSentryEvent({
        exception: {
          values: [
            {
              type: 'Error',
              value: 'Connection closed.',
              stacktrace: {
                frames: [
                  {
                    filename:
                      'react-server-dom-turbopack-client.browser.production.js',
                    function: 'close',
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
              type: 'Error',
              value: 'An unexpected response was received from the server.',
              stacktrace: {
                frames: [
                  {
                    filename:
                      'node_modules/next/src/client/components/router-reducer/reducers/server-action-reducer.ts',
                    function: 'fetchServerAction',
                  },
                ],
              },
            },
          ],
        },
      }),
    ).toBe(true);
  });

  it('keeps Next client transient exceptions with app frames', () => {
    expect(
      shouldDropClientSentryEvent({
        exception: {
          values: [
            {
              type: 'Error',
              value: 'An unexpected response was received from the server.',
              stacktrace: {
                frames: [
                  {
                    filename: 'apps/web/app/[lang]/login/actions.ts',
                    function: 'login',
                  },
                ],
              },
            },
          ],
        },
      }),
    ).toBe(false);
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

    expect(
      shouldDropClientSentryEvent({
        exception: {
          values: [
            {
              type: 'CompileError',
              value:
                'WebAssembly.Module(): Compiling function failed: Wasm SIMD unsupported',
              stacktrace: {
                frames: [{ filename: 'blob:app:///krisp-worker' }],
              },
            },
          ],
        },
      }),
    ).toBe(true);
  });

  it('drops framework-only React render loop noise', () => {
    expect(
      shouldDropClientSentryEvent({
        exception: {
          values: [
            {
              type: 'Error',
              value:
                'Maximum update depth exceeded. This can happen when a component repeatedly calls setState inside componentWillUpdate or componentDidUpdate.',
              stacktrace: {
                frames: [
                  {
                    filename: 'react-dom-client.production.js',
                    function: 'dispatchSetStateInternal',
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
              type: 'Error',
              value: 'Rendered more hooks than during the previous render.',
              stacktrace: {
                frames: [
                  {
                    filename: 'next/src/client/components/app-router.tsx',
                    function: 'Router',
                  },
                  {
                    filename: 'react-dom-client.production.js',
                    function: 'updateWorkInProgressHook',
                  },
                ],
              },
            },
          ],
        },
      }),
    ).toBe(true);
  });

  it('keeps React render loop errors with app or shared chunk frames', () => {
    expect(
      shouldDropClientSentryEvent({
        exception: {
          values: [
            {
              type: 'Error',
              value: 'Maximum update depth exceeded.',
              stacktrace: {
                frames: [
                  {
                    filename: 'apps/web/components/audio-generator.tsx',
                    function: 'AudioGenerator',
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
              type: 'Error',
              value: 'Maximum update depth exceeded.',
              stacktrace: {
                frames: [
                  {
                    filename:
                      'https://sexyvoice.ai/_next/static/chunks/1234.js',
                    module: 'react-dom-client',
                  },
                ],
              },
            },
          ],
        },
      }),
    ).toBe(false);
  });

  it('keeps Wasm SIMD errors with app frames', () => {
    expect(
      shouldDropClientSentryEvent({
        exception: {
          values: [
            {
              type: 'CompileError',
              value: 'Wasm SIMD unsupported',
              stacktrace: {
                frames: [
                  {
                    filename: 'apps/web/lib/audio/custom-wasm.ts',
                    function: 'loadAudioModule',
                  },
                ],
              },
            },
          ],
        },
      }),
    ).toBe(false);
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

    expect(
      shouldDropClientSentryEvent({
        exception: {
          values: [
            {
              type: 'Error',
              value:
                "Uncaught NetworkError: Failed to execute 'importScripts' on 'WorkerGlobalScope': The script at 'https://sexyvoice.ai/_next/static/chunks/0a1ki9igslyi1.js?dpl=dpl_F6PAqfgpYrrgLMxCTpLSnibogqzK' failed to load.",
              stacktrace: {
                frames: [
                  {
                    filename:
                      'app:///_next/static/chunks/turbopack-worker-0g5kymvzkx-yr.js',
                    function: 'global code',
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
              type: 'Error',
              value:
                "Uncaught NetworkError: Failed to execute 'importScripts' on 'WorkerGlobalScope': The script at 'https://sexyvoice-git-fix-sentry.vercel.app/_next/static/chunks/0a1ki9igslyi1.js?dpl=dpl_F6PAqfgpYrrgLMxCTpLSnibogqzK' failed to load.",
              stacktrace: {
                frames: [
                  {
                    filename:
                      'app:///_next/static/chunks/turbopack-worker-0g5kymvzkx-yr.js',
                    function: 'global code',
                  },
                ],
              },
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

  it('drops ProseMirror selection collapse noise without app frames', () => {
    expect(
      shouldDropClientSentryEvent({
        exception: {
          values: [
            {
              type: 'IndexSizeError',
              value:
                "Failed to execute 'collapse' on 'Selection': The offset 37 is larger than the node's length (36).",
              stacktrace: {
                frames: [
                  {
                    filename:
                      'node_modules/.pnpm/prosemirror-view@1.41.6/node_modules/prosemirror-view/dist/index.js',
                    function: 'df.setSelection',
                  },
                ],
              },
            },
          ],
        },
      }),
    ).toBe(true);
  });

  it('keeps ProseMirror selection errors with app frames', () => {
    expect(
      shouldDropClientSentryEvent({
        exception: {
          values: [
            {
              type: 'IndexSizeError',
              value:
                "Failed to execute 'collapse' on 'Selection': The offset 37 is larger than the node's length (36).",
              stacktrace: {
                frames: [
                  {
                    filename: 'apps/web/components/grok-tts-editor.tsx',
                    function: 'restoreSelection',
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
