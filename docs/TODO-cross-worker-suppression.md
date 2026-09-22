# Cross-worker response suppression (P2 — deferred)

## Problem

`response-suppression.ts` uses in-process `Map` storage. With multiple PM2 workers
(`owlhuntbot-shard`, `owlhuntbot-worker`), the same user may receive duplicate
error/hint messages if consecutive requests hit different workers.

## Scope (future)

- Redis-backed suppression keys mirroring `acquireUserResponse` semantics
- TTL aligned with `FLOW_SUPPRESSION_MIN_INTERVAL_MS`
- Intent-exempt keys unchanged

## Not a deploy blocker

v2.1 hardening intentionally leaves this as-is. Track in a dedicated issue before
scaling PM2 worker count.
