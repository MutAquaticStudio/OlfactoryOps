# LLM Provider Gateway

`FormulaLlmGateway` is a server-only port. Phase 6 registers only
`NotConfiguredFormulaLlmGateway`, which returns `NOT_CONFIGURED`, `provider:
NONE`, no model name and a correlation ID. It makes no network call.

Any future provider adapter must remain behind this port and provide strict
structured output validation, a bounded timeout, retry classification,
sanitized errors, usage metadata where available and an approved server-side
secret source. It must not persist hidden reasoning, credentials, headers or
raw provider errors.

`LIVE_PROVIDER_SMOKE = BLOCKED` because this checkpoint intentionally has no
test credential. That is not treated as provider readiness.
