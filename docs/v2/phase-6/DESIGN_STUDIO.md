# Design Studio

The Design Studio sequence is:

`Raw brief -> reviewed structured brief -> constraint snapshot -> material universe -> advisory candidate -> Formula Draft`

Structured briefs retain unresolved questions explicitly. A material universe is
tenant-scoped, hashes the reviewed brief plus the eligible material set, and
excludes inactive and blocked materials. Candidate components must belong to
that pinned universe and validate as exactly 100 percent before a draft can be
created.

Candidates are advisory. Their initial evaluation keeps unknown evidence as
`NOT_EVALUATED`; it does not turn a missing compliance, inventory, scientific
or consumer signal into a favorable score. Saving a candidate creates a normal
editable draft with provenance and never approves it or moves stock.

Recipient shares are scoped to an active tenant member. Safe shares do not
return material IDs, component ratios, costs, lots, private documents or raw
compliance details. Material names require explicit disclosure.
