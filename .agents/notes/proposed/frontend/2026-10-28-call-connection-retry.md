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

`onError` and its `disconnect` dependency use `useCallback` because LiveKit
includes `onError` in its connection effect dependencies. Their identity must
survive ordinary rerenders to avoid restarting a pending attempt. This is SDK
identity semantics, rather than a rendering optimization.

## Alternatives

Resetting on every initial disconnect can suppress LiveKit's final error
callback. A custom retry loop would compete with SDK regional fallback. Per-hop
timeouts cannot enforce a total wait limit, so the application owns the overall
30-second deadline. This can stop a connection that would succeed later; it
keeps retrying available instead of leaving the controls busy for minutes.

## Verification

Component tests cover final failure, fresh-token retry, callback stability,
initial disconnect ordering, established-room disconnect, intentional hangup,
credit-refresh failure, the 30-second deadline, timer cleanup, and fresh retry
deadlines. LiveKit room events are mocked; production rooms and billing settings
are outside the test boundary.

`pnpm fixall`, `pnpm type-check`, and `pnpm check-translations` pass. Web Vitest
passes with 111 files, 1,622 tests, and 18 skips. The full suite uses
`--maxWorkers=4` and an isolated Redis binary under `/tmp`.
