# OlfactoryOps

OlfactoryOps là workspace vận hành đa tenant cho đội ngũ fragrance: công thức, vật liệu, tồn kho, procurement, production, commerce và audit. Repository này đang ở **Pre-V2 cleanup checkpoint**. V2 chưa bắt đầu; các bề mặt nghiên cứu AI, supplier catalogue và import V1 đã được gỡ khỏi product surface và lưu trong `archive/legacy-v1/` để tham chiếu lịch sử.

## Kiến trúc hiện tại

```text
React 19 + Vite (Pages)
        │ HTTPS / exact-origin CORS / CSRF
        ▼
Cloudflare Worker API ── D1 normalized persistence
        │                 ├─ tenant/auth/RBAC/session
        │                 ├─ material/compliance/document evidence
        │                 ├─ formula/version/approval
        │                 ├─ inventory ledger + FEFO
        │                 ├─ procurement/production/orders
        │                 └─ audit + notification outbox
        ├─ KV/R2 adapter cho document payload (khi binding được cấu hình)
        ├─ Workers AI/Vectorize adapter cho evidence retrieval (Not configured nếu thiếu binding)
        └─ tenant-app-router cho system workspace hostname
```

- **Frontend:** `src/App.tsx`, dữ liệu domain và type trong `src/data/`. Pages SPA giữ route tương thích cho workspace hiện tại; route V1 đã xóa trả `410 V1_SURFACE_REMOVED`.
- **Backend local:** NestJS/Fastify trong `server/src/`. `NorthStarService` giữ domain rules; `MutationIdempotencyService` bảo vệ mutation local.
- **Worker:** `worker/index.ts` là API production; `worker/tenant-app-router.ts` định tuyến hostname workspace. Auth/session, tenant scope, CSRF, permission và audit đều kiểm tra server-side.
- **Database:** D1 là nguồn sự thật cho nghiệp vụ. Migrations trong `migrations/` là append-only; không sửa migration lịch sử. Snapshot chỉ còn cho cutover/legacy read.
- **Authentication:** signup/login/email verification/password reset/session revocation/CSRF. Organization và actor luôn lấy từ authenticated context, không tin body.
- **Data flow:** browser → exact-origin Worker API → hydrate tenant state từ D1 → domain mutation có permission + idempotency → transaction/ledger/audit → outbox notification → response đã redacted. Formula save không tự consume; inventory movement chỉ qua receipt/usage/reservation/production flow.

## Active modules

Home, Materials, Formulas, Inventory, Trials & Sensory, Documents/Evidence, Production, Procurement, Catalog/Quotes, Orders, Costing, Analytics và Workspace Access/Security. Tenant-private material và document evidence luôn tenant-scoped; RAG chỉ trả citation/evidence giới hạn khi binding và permission đã cấu hình.

## Pre-V2 cleanup

- V1 Formula Agent/Design Studio/Optimizer, Lluch catalogue/global master projection, CSV/XLSX import và standalone Supplier Material Profile không còn route/UI/job active.
- Historical source, plans, fixtures và migrations được giữ nguyên trong `archive/legacy-v1/`, `docs/legacy/v1/` hoặc migrations bất biến; không xóa dữ liệu tenant thật.
- Ledger, FEFO, procurement/production evidence, trials/sensory primitives, auth/RBAC/CSRF, branding, notifications, privacy/legal và observability được giữ lại.
- Quyết định, dependency map, inventory và verification: [00_PRE_V2_CLEANUP.md](00_PRE_V2_CLEANUP.md), [PRE_V2_BASELINE.md](PRE_V2_BASELINE.md), [LEGACY_FILE_INVENTORY.md](LEGACY_FILE_INVENTORY.md), [LEGACY_FEATURE_DEPENDENCY_MAP.md](LEGACY_FEATURE_DEPENDENCY_MAP.md), [REMOVAL_REPORT.md](REMOVAL_REPORT.md), [LEGACY_REFERENCE_SCAN.md](LEGACY_REFERENCE_SCAN.md), [CLEANUP_VERIFICATION.md](CLEANUP_VERIFICATION.md).

## Local setup

Requirements: Node.js 20+, npm, Wrangler (for Worker/D1 checks).

```powershell
npm install
npm run dev
npm run dev:api
```

Local frontend mặc định ở `http://localhost:5173`; API local ở port được cấu hình trong `server/src/main.ts`. Dùng dữ liệu seed an toàn trong code/test; không đưa credential production vào `.env` hoặc Git.

## Verification commands

```powershell
npm test
npm run lint
npm run build
npm run build:api
npm run typecheck:worker
npm run build:worker
npm run build:tenant-router
npm run security:client-bundle
npm audit --omit=dev --audit-level=high
npm run release:migrations:verify
npm run release:docs:check
```

`npm run test:ux` và production smoke chỉ chạy khi đã cung cấp credential test qua environment variables. Destructive QA chỉ được phép trên test D1/Worker; production smoke chỉ đọc health, routing, login và tenant data.

## Cloudflare deployment boundary

Worker test/prod dùng bindings trong `wrangler.test.toml` và `wrangler.toml`. Chạy migration trên đúng D1 trước khi deploy Worker. R2, Resend, Cloudflare SaaS, Workers AI và Vectorize thiếu credentials/binding phải hiển thị `Not configured`; không giả lập ready. Secrets chỉ đưa bằng Wrangler/Cloudflare dashboard, không commit.

## Current status

Release candidate `0.1.0-rc.1`, migration head `0044`. Pre-V2 cleanup gates đã PASS, gồm test, lint, builds, dependency/secret scan, migration/docs checks, public UX smoke và authenticated role matrix trên môi trường Worker/D1 cô lập. Remote D1 và production smoke là `NOT_APPLICABLE`: repository này đang được đóng băng làm transition baseline cho OlfactoryOps V2, không thực hiện legacy production release. Không triển khai hoặc bắt đầu V2 trong checkpoint này.
