# OlfactoryOps Cloudflare Deployment

OlfactoryOps now has a Cloudflare-native commercial deployment path:

- Frontend: Cloudflare Pages.
- API: Cloudflare Workers.
- Persistent commercial state: Cloudflare D1.
- Future document binaries: Cloudflare R2.

The Worker reuses the existing North Star domain service and stores Formula-specific R&D state in the D1-backed `northstar_snapshots` table until the Formula module redesign is guided. The commercial hardening pass has moved tenant, auth, audit, material master, inventory, lab usage, document, production, procurement, catalog, customer, order, analytics scheduling, billing, invoice, and webhook delivery state into normalized D1 tables so sell-ready operations can be queried and persisted independently.

## 1. Create D1

Log in to Wrangler:

```bash
npx wrangler login
```

Create the production database:

```bash
npx wrangler d1 create olfactoryops-production
```

Copy the returned `database_id` into `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "olfactoryops-production"
database_id = "<your-cloudflare-d1-database-id>"
```

Apply migrations:

```bash
npm run d1:migrate:remote
```

For local Worker testing:

```bash
npm run d1:migrate:local
```

## 2. Deploy Worker API

`wrangler.toml` is configured for the Lab of Scent domain:

```toml
[vars]
CORS_ORIGINS = "http://127.0.0.1:5173,http://localhost:5173,https://labofscents.org,https://www.labofscents.org,https://app.labofscents.org,https://labofscents.pages.dev,https://*.labofscents.pages.dev"

[[routes]]
pattern = "api.labofscents.org"
custom_domain = true
```

Deploy:

```bash
npm run deploy:worker
```

Smoke test:

```bash
curl https://<worker-host>/api/v1/health
curl https://<worker-host>/api/v1/persistence/status
```

Optional custom API hostname:

- The Worker custom domain is configured as `api.labofscents.org`.
- Use `https://api.labofscents.org/api/v1` as the frontend API base.

## 3. Deploy Frontend On Cloudflare Pages

Create a Pages project connected to the GitHub repo.

- Framework preset: `Vite`
- Build command: `npm ci && npm run build`
- Build output directory: `dist`
- Production environment variable:

```bash
VITE_API_BASE_URL=https://api.labofscents.org/api/v1
```

If you do not set a custom Worker hostname yet, use the `workers.dev` URL:

```bash
VITE_API_BASE_URL=https://<worker-host>/api/v1
```

Recommended Pages custom domains:

- `labofscents.org`
- `www.labofscents.org`
- Optional admin app domain: `app.labofscents.org`

The repo includes:

- `public/_redirects` for SPA fallback.
- `public/_headers` for baseline browser security headers.

## 4. Pre-Deploy Checks

Run before pushing or deploying:

```bash
npm run deploy:check
```

This validates:

- Frontend TypeScript and Vite build.
- Legacy Nest API build.
- Worker typecheck and dry-run bundle.
- Vitest domain tests.
- Client bundle secret scan.

For live functional smoke testing and a Markdown report:

```bash
npm run test:functional:report
```

The functional report verifies cookie auth, hybrid D1 persistence status, CSRF rejection on missing write token, tenant permission probes, core read models, signed document URLs, and the Production phase evidence UI.

## Notes

- D1 is SQLite-compatible, not Postgres. The current Worker persistence layer is hybrid only for Formula R&D records awaiting the guided Formula pass. Sell-ready state now uses normalized D1 tables including `tenant_organizations`, `tenant_brands`, `tenant_memberships`, `role_policies`, `auth_sessions`, `audit_events`, `security_rate_limits`, `material_records`, `molecule_components`, `storage_locations`, `stock_take_records`, `tenant_settings`, `feature_flags`, `numbering_sequences`, `custom_fields`, `tenant_branding`, `document_records`, `production_batches`, `suppliers`, `purchase_orders`, `price_history`, `commercial_skus`, `price_lists`, `quotes`, `sample_requests`, `customers`, `sales_orders`, `order_shipments`, `order_documents`, `scheduled_reports`, `billing_subscriptions`, `billing_invoices`, `webhook_deliveries`, `inventory_lots`, `inventory_movements`, and `lab_usage_records`.
- Apply D1 migrations before deploying Worker code that depends on new normalized tables.
- Cookie-authenticated mutating API requests require `X-CSRF-Token`. The frontend obtains the token from `login`, `signup`, or `me` and keeps it in memory only.
- Keep document binaries and generated PDFs out of D1. Store files in R2 and keep only metadata/signed URL evidence in D1.
- The next persistence hardening target is Formula R&D once the Formula module behavior is finalized.

