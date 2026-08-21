# Sentiment Service Boundary

Sentiment contracts cover consented consumer feedback, language, aspects, perception signals, olfactory descriptors, and preference vectors. Raw feedback, aggregates, private sensory memory, RAG evidence, and scientific predictions remain separate. No cross-tenant learning or automatic formula mutation is allowed.

`src/deterministic-analyzer.ts` is a bounded EN/VI fallback for feedback read
transiently from an approved private store. It returns derived,
low-confidence signals only; raw feedback is neither written to PostgreSQL nor
returned by an API. A production provider may use the same output contract only
after source consent and retention controls are satisfied.
