# Phase 2 FEFO Allocation

FEFO first limits candidates to the authenticated tenant and requested active
material. It excludes quarantine, hold, rejected, expired, failed-quality, and
zero-available lots. Eligible lots are sorted by expiry, then creation time,
then lot ID. Allocation is deterministic and may span lots.

Available quantity is reconstructed as ledger on-hand minus the unconsumed
portion of active reservations. A confirmed weighing session may consume its
own reservation, but cannot use another reservation or bypass lot eligibility.
