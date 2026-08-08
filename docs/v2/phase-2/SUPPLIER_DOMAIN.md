# Phase 2 Supplier Domain

Supplier Profiles are operational counterparties, separate from Materials.
Supplier Offers connect a supplier grade/product to one tenant material with
MOQ, unit, price, validity, lead time, and status. An order can use an offer
only if supplier, material, and offer are active and match each other.

Supplier document references are reviewable evidence rows. Price revisions
write an append-only `v2_supplier_offer_price_history` record; an offer's
current price is therefore never the only commercial evidence.

Supplier performance is a derived projection from receipt-line inspection and
return evidence. It is not an editable supplier score.
