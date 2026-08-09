# Formula Agent Tool Registry

The registry is a fixed allow-list. Every named tool has a permission, timeout,
maximum result size and read-only designation. Unknown names fail closed before
an adapter is called.

Supported names are material search/get, inventory visibility, compliance
status, evidence search, scientific identity/prediction/similarity/explanation
and consumer preference. The initial provider-disabled workflow currently
executes only `material.search`; all other names are declared so a future
adapter cannot invent a capability.

Each real invocation must repeat tenant context, permission checks, input
validation, bounded output, audit and provenance. Tools are never allowed to
run arbitrary SQL, shell commands, JavaScript, HTML or URL fetches.
