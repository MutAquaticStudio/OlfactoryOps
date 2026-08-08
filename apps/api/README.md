# V2 API Boundary

This is the target HTTP/BFF boundary for the V2 API. The current Nest/Fastify implementation remains in `server/src/` and the current Worker remains in `worker/`. New routes must derive tenant and actor context from authentication, validate idempotency, and delegate to services; no blind move or second database writer is allowed.
