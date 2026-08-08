# Phase 2 Inventory Ledger and FEFO

## Immutable ledger

V2 inventory derives quantity from `v2_inventory_movements` plus active reservations. It has no editable on-hand balance.

Allowed Phase 2 movement types are `RECEIPT`, `TRANSFER`, `RESERVE`, `RELEASE_RESERVATION`, `CONSUMPTION`, `ADJUSTMENT`, `RETURN`, and `WASTE`. Corrections use a new compensating `ADJUSTMENT` row linked to the original movement; movement deletion is not available.

## Projection

`on_hand = SUM(quantity_delta_g)` and `available = on_hand - SUM(active reservation quantity minus consumed quantity)`. The projection can always be rebuilt from immutable movements and active reservation state.

## FEFO

FEFO first rejects wrong-tenant, inactive material, quarantine, non-available, failed-quality, expired, and zero-available lots. It then orders by expiry, creation time, and lot ID for deterministic allocation.

## Weighing

Creating a weighing session is planning only. Confirmation checks an active material, eligible matching lot, tolerance, and available stock under a row lock before recording `CONSUMPTION`. The session records requested, actual, selected lot, and movement ID for traceability.

## Reservations and adjustments

Only `PRODUCTION_OUTPUT` and `SHIPMENT` are valid reservation contexts. They are not Phase 2 inventory movement types. A weighing line can consume only its linked reservation; remaining quantity can be released or expired. Releasing or expiring a reservation creates immutable zero-quantity `RELEASE_RESERVATION` evidence. Controlled adjustments and waste require a reason and cannot reduce available stock below active reservations. A minimal controlled location transfer writes a zero-quantity `TRANSFER` evidence row.
