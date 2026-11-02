# Call connection recovery

## Decision

The connection provider aborts token acquisition after 30 seconds, including
reading the response body. Timeout shows the connection failure message and
rejects `connect()`, allowing the button's `finally` block to release its busy
state. Token acquisition and LiveKit joining have separate deadlines, for up to
60 seconds after character saving and microphone permission finish.

`RoomWrapper` handles LiveKit's terminal connection error and established-room
disconnect callbacks. The connection provider owns the reset and credit refresh;
the wrapper owns the localized notifications. SDK regional retries share a
30-second deadline starting when the call token is available. Expiry uses the
same error/reset path and sets the room's `connect` prop to false, which invokes
LiveKit's disconnect and cancels the pending attempt. Room connection, failure,
hangup, and unmount clear the timer. Each fresh token gets a fresh deadline.

An initial failed join emits `Disconnected` before `room.connect()` rejects.
The wrapper tracks whether the room connected so this event does not reset the
connection flag before LiveKit can deliver `onError`. Only the final error shows
the failure notification. An intentional hangup refreshes credits once.
LiveKit also reports microphone acquisition failures through `onError`, including
before `onConnected`. `MediaDeviceFailure` identifies permission, missing-device,
and busy-device failures; constraint error names need an explicit check because
the SDK groups them as `Other`. These failures show localized microphone guidance
and disconnect even after connection, so a call cannot keep consuming credits
without a working microphone. Unclassified errors and deadline expiry retain the
connection failure message during setup.

With `@livekit/components-react` 2.9.24 and `livekit-client` 2.23.0, the audio-only
wrapper's post-connect `onError` source is the microphone acquisition/publishing
promise started by `SignalConnected`. Room connection does not await publishing.
Every post-connect error disconnects and defaults to microphone guidance,
including `PublishTrackError`, negotiation errors, and Firefox capture
`AbortError`, which `MediaDeviceFailure` classifies as `Other`. Permission failures
retain their specific guidance. The handler reads the connection marker before
resetting it to choose the message for that phase.

`onError` and its `disconnect` dependency use `useCallback` because LiveKit
includes `onError` in its connection effect dependencies. Their identity must
survive ordinary rerenders to avoid restarting a pending attempt. This is SDK
identity semantics, rather than a rendering optimization.

## Alternatives

Keeping a connected room alive on unclassified `onError` is unsafe: the callback
reports delayed microphone publish failures, leaving a billed call without audio.

Resetting on every initial disconnect can suppress LiveKit's final error
callback. A custom retry loop would compete with SDK regional fallback. Per-hop
timeouts cannot enforce a total wait limit, so the application owns the overall
30-second deadline. This can stop a connection that would succeed later; it
keeps retrying available instead of leaving the controls busy for minutes.

## Verification

Component tests cover final failure, fresh-token retry, callback stability,
initial disconnect ordering, established-room disconnect, intentional hangup,
credit-refresh failure, the 30-second deadline, timer cleanup, and fresh retry
deadlines. They also cover stalled token requests and response bodies, microphone
publishing failures, and device failures before and after connection.
LiveKit room events are mocked; production rooms and billing settings
are outside the test boundary.

`pnpm fixall` and `pnpm type-check` pass. Focused Vitest coverage for
`room-wrapper.test.tsx` and `connection-disconnect-claims.test.tsx` passes with
33 tests.
