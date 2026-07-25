/**
 * Dedicated worker entry point for LiveKit end-to-end encryption.
 *
 * `livekit-client/e2ee-worker` is a side-effect only module that installs the
 * `onmessage` / `onrtctransform` handlers the SDK talks to. Re-exporting it from
 * a local file lets us instantiate the worker with a relative
 * `new URL('./worker.ts', import.meta.url)` specifier, which is the form both
 * Turbopack and webpack resolve reliably.
 *
 * See `./client.ts` for the only place this file is instantiated.
 */
import 'livekit-client/e2ee-worker';
