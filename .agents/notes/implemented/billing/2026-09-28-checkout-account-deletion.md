# Coordinate checkout and account deletion

## Decision

Use a shared Redis reservation for app checkout creation and account deletion.
Before deleting account data, expire open Stripe Checkout Sessions, recheck
subscriptions, and atomically commit a billing block while the
deletion request still owns the reservation.

The mechanism and key lifetimes are documented in
[Architecture](../../../../ARCHITECTURE.md#identity-and-session-handling).

## Alternatives and consequences

- A second Stripe read alone leaves a gap before deletion starts.
- A request lock alone cannot stop a Checkout Session opened earlier.
- An expiring lock alone lets a stalled deletion resume after checkout begins.
  The atomic billing block prevents that stale request from deleting data.
- A checkout request with an unknown outcome keeps its reservation until the
  fixed session expiration passes. This temporarily blocks billing and deletion
  after a Stripe failure, but prevents a delayed session from charging after
  deletion. Redis failures also block deletion.
- HTTP status alone does not prove that Checkout creation had no effect. Only
  explicit validation, authentication, and permission rejections from a single
  SDK attempt release the reservation. A final rejection after an SDK retry can
  hide an earlier unknown outcome. Counts are scoped to the reservation's
  idempotency key; the source documentation is linked in Architecture.
- The deletion block holds the request token and has no TTL. The action's
  `finally` clears only its own block, after cleanup succeeds or fails. Retained
  Auth users can return and buy again, consistent with inactive-profile
  restoration. Sign-in itself must not clear a block while cleanup is running.
- A terminated request or failed Redis release leaves a block that requires
  support recovery after confirming cleanup has stopped. Automatic TTL recovery
  would let a stalled deletion resume during a new checkout. See
  [Scripts](../../../../scripts/README.md#restore-account-billing).
- Stripe Dashboard operations and other clients that bypass the app's checkout
  action do not participate in this coordination.

## Verification

Regression tests cover Redis reservation contention and expiry, stale commits,
cleanup blocks, automatic and support recovery, existing Checkout Sessions,
Stripe rejection classification, localized billing errors, and guard ordering
before account and file mutations.
