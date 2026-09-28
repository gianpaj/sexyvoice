# Coordinate checkout and account deletion

## Decision

Use a shared Redis reservation for app checkout creation and account deletion.
Before deleting account data, expire open Stripe Checkout Sessions, recheck
subscriptions, and atomically commit a permanent billing block while the
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
- Redis stores a permanent billing block per deleted account. These keys must
  survive display-cache cleanup. A failed account cleanup can be retried.
- Stripe Dashboard operations and other clients that bypass the app's checkout
  action do not participate in this coordination.

## Verification

Regression tests cover Redis reservation contention and expiry, stale commits,
permanent billing blocks, existing Checkout Sessions, Stripe failures, and
guard ordering before account and file mutations.
