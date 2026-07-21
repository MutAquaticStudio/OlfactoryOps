import type { Phase } from '../../../src/data/northStar.js'

export const internalPhases: Phase[] = [
  { id: 0, name: 'Architecture Blueprint', domain: 'platform', goal: 'Bounded contexts, invariants, permission map', gate: 'Baseline approved', status: 'stable', securityLayer: 'L0', coverage: 100 },
  { id: 1, name: 'Platform Foundation', domain: 'platform', goal: 'Shell, API convention, health, logging', gate: 'Health and shell green', status: 'active', securityLayer: 'L1', coverage: 88 },
  { id: 2, name: 'Tenant/Auth/Security', domain: 'identity', goal: 'Org, brand, user, session, RBAC, audit', gate: 'Tenant isolation tests pass', status: 'active', securityLayer: 'L2/L4', coverage: 86 },
  { id: 3, name: 'Customization Core', domain: 'customization', goal: 'Settings, flags, fields, numbering, branding', gate: 'Config without fork', status: 'active', securityLayer: 'L0', coverage: 84 },
  { id: 4, name: 'Material Intelligence', domain: 'materials', goal: 'Material master, SDS, provenance, molecules', gate: 'Searchable, sourced data', status: 'active', securityLayer: 'L5', coverage: 90 },
  { id: 5, name: 'Formula R&D', domain: 'formulas', goal: 'Accords, resolve, version, IFRA, cost', gate: 'Save does not consume stock', status: 'active', securityLayer: 'L4/L5', coverage: 90 },
  { id: 6, name: 'Lab Inventory Core', domain: 'inventory', goal: 'Lots, movements, FEFO, QC, stock take', gate: 'Only movement changes stock', status: 'active', securityLayer: 'L5', coverage: 92 },
  { id: 7, name: 'Lab Usage Traceability', domain: 'labUsage', goal: 'Commit and reverse usage with audit', gate: 'OUT and IN compensation verified', status: 'active', securityLayer: 'L5', coverage: 84 },
  { id: 8, name: 'Documents & Compliance', domain: 'documents', goal: 'Private docs, signed URL, generation, compliance coverage', gate: 'Access logged and coverage visible', status: 'active', securityLayer: 'L5', coverage: 76 },
  { id: 9, name: 'Production Batch', domain: 'production', goal: 'Approved formula to batch, QC, lifecycle', gate: 'Production separate from lab trial', status: 'active', securityLayer: 'L5', coverage: 78 },
  { id: 10, name: 'Procurement', domain: 'procurement', goal: 'Supplier, PO, goods receipt, price history', gate: 'Low stock to receipt works', status: 'active', securityLayer: 'L4/L5', coverage: 78 },
  { id: 11, name: 'Commerce', domain: 'commerce', goal: 'SKU, pack size, price list, quote/sample', gate: 'Commerce stock reads inventory', status: 'active', securityLayer: 'L4', coverage: 74 },
  { id: 12, name: 'Orders & Fulfillment', domain: 'orders', goal: 'Orders, reservation, shipment, fulfillment', gate: 'Reservation is not movement', status: 'active', securityLayer: 'L5', coverage: 76 },
  { id: 13, name: 'Costing & Finance', domain: 'costing', goal: 'Formula, batch, SKU costs, valuation', gate: 'Cost trace reconciles', status: 'active', securityLayer: 'L4/L5', coverage: 78 },
  { id: 14, name: 'Analytics', domain: 'analytics', goal: 'Burn rate, forecast, expiry, compare', gate: 'Read-only dashboard', status: 'active', securityLayer: 'L4', coverage: 77 },
  { id: 15, name: 'Commercial Readiness', domain: 'saas', goal: 'Billing, subscription gates, SSO, SCIM, API keys, audit export', gate: 'Sell-ready controls enforced', status: 'active', securityLayer: 'L6/L7/L8', coverage: 82 },
]
