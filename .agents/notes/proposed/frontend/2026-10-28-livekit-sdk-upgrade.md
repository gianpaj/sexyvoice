# LiveKit SDK upgrade

## Versions

| Package                       | Version  |
| ----------------------------- | -------- |
| `livekit-client`              | `2.23.0` |
| `livekit-server-sdk`          | `2.19.2` |
| `@livekit/protocol`           | `1.53.0` |
| `@livekit/krisp-noise-filter` | `^0.4.5` |
| `@livekit/components-react`   | `2.9.24` |
| `@livekit/components-styles`  | `^1.2.0` |

Versions were checked against the npm registry on October 28, 2026. React
components and styles already match their latest release. The client satisfies
the React package's `^2.20.1` peer dependency.

Protocol 1.53.1 was published October 26 at 16:48 UTC and is blocked by the repo's
48-hour minimum release age during this upgrade. Version 1.53.0 is the newest
eligible version. A policy exception is unnecessary for its schema additions.

## Rationale and boundaries

Client 2.23.0 bounds connection-error validation to three seconds and releases
connection locks on setup failures. It also cancels pending full reconnects when
the engine closes. The [release notes](https://github.com/livekit/client-sdk-js/releases/tag/v2.23.0)
and [validation fix](https://github.com/livekit/client-sdk-js/pull/2148) describe
the affected pending-connection paths.

SDK timeouts bound individual steps. `RoomWrapper` owns the 30-second total
initial-connection deadline and application state reset; upgrading the SDK does
not replace that behavior. A new application retry loop is unnecessary.

Server SDK improvements include API regional failover and request deduplication.
The call-token route signs a token locally, so browser connection recovery is
owned by the client SDK. Protocol changes add wire types and telemetry fields.
Krisp is a separate audio-processing upgrade; its package has no public changelog.

Client 2.23.0 releases audio contexts and detaches processors when retained tracks
leave a room. The app stops its microphone tracks on disconnect and reapplies
Krisp to live publications. Manual audio verification must cover mute/unmute,
device switching, disconnect, and reconnect.

## Verification

The frozen install passes supply-chain policy checks. `pnpm fixall`,
`pnpm type-check`, and `pnpm check-translations` pass. Web Vitest passes with
111 files, 1,622 tests, and 18 skips. An offline round trip through the real
server SDK and protocol classes preserves room dispatch, metadata, and expiry.

All LiveKit peer requirements are satisfied. `pnpm peers check` reports an
unrelated OpenTelemetry API range mismatch; this lockfile change does not update
OpenTelemetry packages. The existing Sass/immutable resolution is retained.
Live microphone audio and Krisp processing have not been verified manually.
