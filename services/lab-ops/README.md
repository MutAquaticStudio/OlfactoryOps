# Lab Operations Service Boundary

Phase 2 owns V2 Materials, Supplier Profiles/Offers, controlled document references, offer price history, Inventory Lots, the immutable movement ledger, FEFO allocation, reservations, Lab Weighing/Consumption, and request/PO/shipment/receipt/inspection/landed-cost workflows.

Every write must receive a server-derived organization/actor context, enforce a registered permission, use an idempotency key when it changes state, write audit evidence, and remain reconstructable from the ledger. The V2 Global Material dataset is intentionally empty; tenant materials are the only active Phase 2 material scope. This service does not perform Formula, scientific, RAG, production, or global-material work.
