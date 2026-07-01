# OlfactoryOps North Star

OlfactoryOps is a full North Star product scaffold for a fragrance R&D operating layer. The current build is a React/Vite implementation of the full SaaS console described in the supplied MD specs, with every phase/domain represented in the app surface.

## What is implemented

- North Star console covering phases 0 through 15.
- Black glassmorphism app shell with sidebar, topbar, command palette, modal flows, lab backdrop, and responsive layouts.
- Domain workspaces for Platform, Identity/Security, Customization, Material Intelligence, Formula R&D, Inventory, Lab Usage, Documents, Production, Procurement, Commerce, Orders, Costing, Analytics, and SaaS/Enterprise.
- Client-side domain engine for `resolve()`, formula cost roll-up, evaporation curve, inventory stock summary, and FEFO lab usage planning.
- Interactive lab usage commit/reverse flow that creates immutable-style movement records in local UI state.
- Concept reference saved at `docs/concepts/north-star-console.png`.

## Commands

```bash
npm install
npm run dev
npm run build
```

## Notes

This is the North Star product scaffold and interaction layer. The next implementation layer should add the NestJS/Prisma/PostgreSQL backend, move the domain functions into transactional services, and replace local UI state with tenant-scoped API calls.
