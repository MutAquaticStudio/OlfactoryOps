# Phase 2 Data Model

PostgreSQL owns all V2 Phase 2 records and each table is forced through RLS on
`organization_id`.

```text
Material -> Supplier Offer -> Purchase Request/Order -> Shipment -> Receipt
Receipt -> Quarantine Lot -> Inspection -> Available Lot -> FEFO
Lot -> Reservation -> Lab Weighing -> Immutable Movements
```

Material and supplier documents retain reference metadata only. Inventory has a
minimal controlled location string; a transfer changes location and writes a
zero-quantity `TRANSFER` evidence row. QR is intentionally only a foundation:
the V2 lot ID may be encoded by a client, but every scan must call the
tenant-authorized lot-detail endpoint. Camera scanning and label generation are
not implemented in this phase.
