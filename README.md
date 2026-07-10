# OlfactoryOps North Star

OlfactoryOps is a full North Star product scaffold for a fragrance R&D operating layer. The current build is a React/Vite implementation of the full SaaS console described in the supplied MD specs, with every phase/domain represented in the app surface.

## What is implemented

- North Star console covering phases 0 through 15.
- Black glassmorphism app shell with sidebar, topbar, command palette, modal flows, lab backdrop, and responsive layouts.
- Domain workspaces for Platform, Identity/Security, Customization, Material Intelligence, Formula R&D, Inventory, Lab Usage, Documents, Production, Procurement, Commerce, Orders, Costing, Analytics, and SaaS/Enterprise.
- Client-side domain engine for `resolve()`, formula cost roll-up, evaporation curve, inventory stock summary, and FEFO lab usage planning.
- Interactive lab usage commit/reverse flow that creates immutable-style movement records in local UI state.
- NestJS/Fastify API foundation for health, roadmap, materials, formula resolve, inventory summary, movement ledger, and lab usage commit/reverse.
- Documents & Compliance API foundation for private document metadata, short-lived signed URL issuance, and download audit evidence.
- Backfilled API foundations for missing North Star phases: tenant/security probes, customization settings/numbering, production batch consumption, procurement receiving, catalog SKU availability, order reservation/fulfillment, and enterprise audit export controls.
- Vitest coverage for the core domain invariants.
- Concept reference saved at `docs/concepts/north-star-console.png`.

## Commands

```bash
npm install
npm run dev
npm run dev:api
npm run dev:worker
npm run build
npm run build:api
npm run build:worker
npm run start:api
npm run deploy:worker
npm run d1:migrate:local
npm run d1:migrate:remote
npm run test
npm run deploy:check
```

## Deployment

See `docs/deployment.md` for the Cloudflare Pages + Workers API + D1 deployment path.

## Notes

This is the North Star product scaffold and first API foundation. The next implementation layer should add Prisma/PostgreSQL persistence, tenant-scoped auth/session guards, and database-backed transaction boundaries for inventory movement, lab usage, documents, and audit logs.
