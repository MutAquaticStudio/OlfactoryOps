# Phase 2 Procurement Workflow

```text
Need -> Purchase Request -> Approval -> Active Supplier Offer -> Purchase Order
     -> Approval -> Shipment -> Goods Receipt -> Quarantine Lot -> Inspection
     -> Accept / Reject / Return -> Available Inventory
```

## Invariants

- Receipt is never availability. Receipt writes a `RECEIPT` ledger row and creates a `QUARANTINE` / `PENDING` lot.
- Only inspection `ACCEPT` moves a lot to `AVAILABLE` / `PASSED`.
- `RETURN` keeps the receipt evidence, creates an immutable negative return movement, and creates a return authorization.
- Landed cost uses freight, duty, and insurance from the receipt. It allocates proportionally by line value, rounds deterministically, applies residual to the highest-value line, and writes immutable allocation rows. Posting is one-time.
- Purchase request and purchase order transitions are server-owned. A PO needs an approved request when one is linked; a receipt tied to a PO requires it to be sent and cannot exceed the ordered line quantity.
- A shipment must belong to its PO. Receipt completion records delivery and advances PO receipt status without conflating a shipment with an inventory movement.
- Supplier/offer/PO/receipt references are verified inside the current organization before use.

## Permissions

`procurement.create` creates requests and orders. `procurement.receive` posts receipts and landed cost. `procurement.inspect` controls disposition. Supplier approval and material approval are independent capability checks.
