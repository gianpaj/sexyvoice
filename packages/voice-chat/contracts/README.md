# LiveKit call dispatch

SexyVoice owns the versioned JSON in `RoomAgentDispatch.metadata`. The browser
gets a room grant. SexyCall verifies the shape, expiry, room, and caller before
accepting a linked call. The optional saved voice is a database reference UUID.
Resolve it within the authenticated user's Inworld references.

Generate the schema from the repository root:

```sh
node packages/voice-chat/export-dispatch-schema.mts > packages/voice-chat/contracts/dispatch-v1.schema.json
```

Versioned releases are immutable. Copy the schema and fixtures from the same
SexyVoice commit into SexyCall's `src/contracts/` and run both contract suites.
Record the source commit with the copies. For a breaking change, add a new
version and deploy a reader for it before selecting it in the producer.
