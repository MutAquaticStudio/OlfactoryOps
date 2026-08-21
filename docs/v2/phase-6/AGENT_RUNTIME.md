# Agent Runtime

The V2 research runtime is durable and provider-neutral. A run has an
organization, creator, bounded workflow key, job lease, monotonic event
sequence, artifacts and an audit trail. Only its creator can replay run events
or cancel a run. Events are persisted before replay and the client reducer
deduplicates event IDs and buffers out-of-order sequences.

The initial workflow is read-only. It executes the named `material.search`
tool against the tenant material table, stores only a bounded result hash and
returns an honest provider-disabled artifact. The run then enters
`WAITING_FOR_CONFIRMATION`; accepting its research-review confirmation records
the decision exactly once and completes the run. It does not create a Formula
Draft, write inventory, change compliance, approve a Formula, alter roles or
perform arbitrary SQL, shell, HTML, JavaScript or URL execution.

Jobs have a 60 second lease and a three-attempt ceiling. Cancellation clears
the lease and terminates the job. Every run, job, event and artifact write is
fenced by the current lease token. Confirmation expires after its durable
expiry timestamp; a retry is permitted only for a failed run that remains
below the attempt ceiling. Provider-disabled execution is terminal and does
not retry as though it were a provider failure.

Candidate evidence is reference-only. Approved RAG sources, verified
scientific artifacts and valid consumer preference vectors are re-authorized
in the current organization before their hashes are recorded. The formula
service never stores raw excerpts, feedback text, lot data, cost data or
provider reasoning in an Agent artifact.
