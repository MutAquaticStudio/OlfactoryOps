# OlfactoryOps

OlfactoryOps is a multi-tenant operating system for fragrance R&D and commercial operations. It connects material intelligence, formula work, lot inventory, production, procurement, commerce, orders, compliance evidence, and operational analytics in one workspace.

## Stack

- React 19 + Vite frontend
- NestJS/Fastify local API for development
- Cloudflare Workers API + D1 persistence for hosted environments
- Vitest for domain tests and Playwright-based functional harnesses

## What You Need

- Node.js 22 or newer
- npm 10 or newer
- Cloudflare account and Wrangler authentication only for Worker/D1 deployment

## Quick Start

Install dependencies:

```bash
npm ci
```

Start the local API in one terminal:

```bash
npm run dev:api
```

Start the frontend in a second terminal:

```bash
npm run dev
```

Open `http://127.0.0.1:5173`. The Vite app calls the local API at `http://127.0.0.1:4000/api/v1` by default.

To point the frontend at another API, create an ignored local `.env.local` file:

```bash
VITE_API_BASE_URL=https://your-api-host.example/api/v1
```

Do not put passwords, Cloudflare secrets, or production credentials in a `VITE_` variable. Those values are bundled into browser code.

## Sign In And Sample Data

The development service starts with a seeded administrator account:

- Email: `admin@labofscents.org`
- Password: configure it through the password-hash helper below; no default password is stored in source control.

Create a password verifier interactively:

```bash
npm run security:hash-admin-password
```

For the local Nest API, set the resulting verifier in the same PowerShell session before starting the API:

```powershell
$env:SEEDED_ADMIN_PASSWORD_HASH = 'pbkdf2:v1:sha256:...'
npm run dev:api
```

For Cloudflare, store the generated verifier as `SEEDED_ADMIN_PASSWORD_HASH` using Wrangler. The seeded workspace includes representative materials, lots, formulas, production batches, SKUs, customers, quotes, orders, audit events, and analytics records so the primary flows are usable immediately.

## Useful Commands

```bash
# Build and type-check the frontend
npm run build

# Build the Nest API
npm run build:api

# Run domain tests
npm run test

# Run all deploy-time checks
npm run deploy:check

# Start the Cloudflare Worker against local D1
npm run dev:worker

# Apply D1 migrations locally
npm run d1:migrate:local

# Run functional and Formula live checks (requires credentials in environment variables)
npm run test:functional:report
npm run test:formula:live
```

## Cloudflare Deployment

The hosted architecture is Cloudflare Pages for the frontend and Cloudflare Workers + D1 for the API and data store.

1. Authenticate and create the D1 database.
2. Copy the D1 database ID into `wrangler.toml`.
3. Apply migrations with `npm run d1:migrate:remote`.
4. Store `SEEDED_ADMIN_PASSWORD_HASH` as a Worker secret.
5. Deploy the API with `npm run deploy:worker`.
6. Set the Pages build command to `npm ci && npm run build`, output directory to `dist`, and `VITE_API_BASE_URL` to the deployed API endpoint.

The full production checklist, security requirements, custom domain guidance, and live test commands are in [docs/deployment.md](docs/deployment.md).

### Enterprise Release Gates

- Apply D1 migrations before deploying a Worker. `0025_enterprise_persistence_audit_chain.sql` completes the normalized-state cutover and adds append-only audit-chain evidence. `0026_finished_goods_operational_trace.sql` adds finished-good lots, finished-good ledger/COGS, formula SKU support, and organization scope for commerce records.
- `0027_operational_p1_enterprise.sql` adds tenant-scoped material compliance, approved supplier offers, quarantined receipt/inspection/RMA records, immutable landed-cost allocations, structured QC specifications/results, yield reconciliation, and operation idempotency records. Apply it before a Worker that exposes the Operational P1 routes.
- A production batch can create a finished-good lot only after approved formula input, raw-material consumption, QC pass, and release. Formula SKUs reserve released finished-good lots using FEFO and write COGS only when fulfilled.
- `GET /api/v1/audit/chain/verify` and `GET /api/v1/audit/chain/evidence` are Owner/Admin-only evidence endpoints. They never return provider secrets.
- Beta integrations are honest by default: integration readiness returns `Not configured` until its Worker secret and any DNS/HTTPS dependency are active. `managed_beta` continues to reject all Stripe customer-payment mutations server-side.

For the isolated beta Worker, use the test configuration explicitly:

```bash
npx wrangler d1 migrations apply olfactoryops-test --remote --config wrangler.test.toml
npm run deploy:worker -- --config wrangler.test.toml
npm run deploy:pages:test
```

Do not deploy the Worker until the remote D1 migration succeeds. `beta.labofscents.org` remains an external DNS/Pages custom-domain gate; a successful Pages preview is not evidence that the hostname resolves or has a valid certificate.

### Operational P1 Workflow

1. An Owner or Admin records a material compliance profile with an IFRA category limit, EU/UK flags, source, version, review date, and disposition. `BLOCKED` materials cannot be purchased or consumed. `REVIEW_REQUIRED` material can only enter receiving quarantine.
2. A sent purchase order creates a goods receipt. Each receipt line becomes a `QUARANTINE` lot and a `RECEIPT` ledger movement; it is not FEFO-eligible or production-eligible.
3. Post freight, duty, and insurance before accepting the receipt. The service allocates the total by extended line value, sends any rounding residual to the highest-value line, and stores immutable landed unit cost on the lot.
4. An Owner, Admin, Lab Manager, or Manager inspects the receipt. Acceptance promotes the lot to available inventory; return-to-supplier writes an immutable return movement. Open discrepancies block acceptance.
5. Create a formula-specific release QC template before starting a P1 batch. Operators record structured results; an Admin or Manager approves QC without MFA. Reconcile yield, waste, labor, and overhead before release. Release then creates a private Batch CoA record in review state and an auditable finished-good lot.

The P1 routes require `Idempotency-Key` on mutations in the Worker. Retrying the same request returns the persisted response instead of repeating a receipt, landed-cost posting, QC approval, yield record, or lifecycle mutation.

## Data And Security Notes

- Tenant access, sessions, permissions, and audit events are server-enforced.
- Mutating cookie-authenticated API calls require a CSRF token.
- D1 stores structured operational metadata; beta SDS/CoA binaries live in a private Cloudflare Workers KV namespace, while document metadata and signed-access evidence remain in D1.
- Generated functional reports, browser evidence, `.env*` files, and credentials are intentionally ignored by Git.

## Production Integrations

The application keeps provider secrets in the Cloudflare Worker only. No `STRIPE_*`, `RESEND_*`, `CLOUDFLARE_*`, password, or provider token may use a `VITE_` prefix.

- **Managed beta billing**: `BILLING_MODE=managed_beta` is the default. It removes plan and invoice data from the customer UI and rejects checkout, portal, plan-change, and Stripe webhook requests server-side. Switch to `self_service` only after Stripe credentials, price IDs, and webhook validation are configured.
- **Transactional email**: the in-app notification outbox is persisted in D1 and delivers invite, new-device security, billing, and privacy-request messages through Resend when `RESEND_API_KEY` and `EMAIL_FROM` are configured. Failures retry with a bounded backoff and never roll back a business mutation.
- **Cloudflare for SaaS**: an Owner or Admin can provision and refresh a customer-owned hostname only after Cloudflare API token, SaaS zone ID, and optional custom origin are configured. The workspace hostname changes only after Cloudflare reports both hostname and SSL activation; DCV and provider errors remain visible while pending.
- **Imports**: Material Library accepts CSV and XLSX for both materials and inventory lots, lets the user map columns, performs a dry-run with row-level errors, and commits only a validated, idempotent job. A lot can match its material by ID, CAS, or name.
- **PWA and QR**: production builds register a privacy-safe app-shell service worker. API responses are never cached. Inventory can scan an OlfactoryOps lot QR through the browser camera and only selects the matching current-workspace lot.
- **Notification and legal operations**: the member inbox supports invitation, security, billing, low-stock and expiry events. Password-reset tokens are one-time and hashed in persistence; legal consent is versioned; a member can download a scoped JSON personal-data export or request erasure review.
- **Observability and language**: `GET /api/v1/status` reports D1 and recent slow/error event counts. Optional Sentry receives only route, status, and duration for Worker 5xx errors. The tenant locale supports English and Vietnamese in the shared shell, navigation, authentication, and notification surfaces while technical fragrance data remains language-neutral.

The public status page is available at `/status.html` on the test Pages, Vercel beta, or production frontend host. It polls only the public health endpoint and does not reveal workspace data.

## Project Layout

```text
src/                    React application and domain models
server/                 NestJS local development API
worker/                 Cloudflare Worker and D1 persistence adapter
migrations/             D1 schema migrations
scripts/                security, functional test, and utility scripts
docs/                   deployment and product documentation
```

## Before A Pull Request Or Deployment

```bash
npm run build
npm run build:api
npm run test
npm run security:client-bundle
```

For a Cloudflare release, use `npm run deploy:check` after the database migrations and Worker secrets are in place.
