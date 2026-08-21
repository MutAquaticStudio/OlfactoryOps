# Agent Platform: Event Protocol

## Envelope

Every persisted runtime event uses protocol `1.0`.

```ts
{
  protocolVersion: '1.0',
  eventId: 'uuid',
  tenantId: 'tenant-scoped id',
  runId: 'run id',
  sequence: 1,
  type: 'node.progress',
  timestamp: 'ISO-8601 UTC',
  payload: {}
}
```

Payloads are JSON records capped at 64 KB. They must never contain provider secrets, browser credentials, hidden reasoning, raw D1 errors, or unrestricted document content.

## Event families

- Run: `run.created`, `run.queued`, `run.started`, `run.paused`, `run.resumed`, `run.cancelled`, `run.completed`, `run.failed`.
- Node: `node.queued`, `node.started`, `node.progress`, `node.completed`, `node.failed`, `node.retrying`.
- Tool: `tool.requested`, `tool.started`, `tool.completed`, `tool.failed`.
- Approval: `confirmation.requested`, `confirmation.accepted`, `confirmation.rejected`.
- Job and connection: `job.*`, `connection.snapshot`, and `connection.resync_required` are reserved typed control events.
- Artifact and message: `artifact.*` and `message.*` carry only registered artifact data and safe progress text.

## Replay and reconnect

1. The client restores run detail and replays persisted events from sequence 0.
2. It opens SSE with `afterSequence=<last contiguous sequence>`.
3. Automatic browser reconnect sends `Last-Event-ID`; APIs prefer it over the query value.
4. Duplicate event ids and already-applied sequences are ignored.
5. Out-of-order events are buffered until their gap arrives.
6. Conflicting events for one sequence, or a buffer over 128 events, require a fresh authoritative replay.

The server owns lifecycle truth. The client reducer is only a resilient display projection and must accept future event types without failing the stream.
