# OlfactoryOps Cloudflare Deployment

OlfactoryOps now has a Cloudflare-native commercial deployment path:

- Frontend: Cloudflare Pages.
- API: Cloudflare Workers.
- Persistent commercial state: Cloudflare D1.
- Future document binaries: Cloudflare R2.

The Worker reuses the existing North Star domain service and stores remaining broad domain state in the D1-backed `northstar_snapshots` table. The commercial hardening pass has moved auth sessions, audit events, auth rate limits, inventory lots, inventory movements, and lab usage records into normalized D1 tables so security and stock operations can be queried and persisted independently. A later hardening phase can continue normalizing documents, orders, production batches, and billing table-by-table.

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

- D1 is SQLite-compatible, not Postgres. The current Worker persistence layer is hybrid: remaining broad domain state still uses snapshots, while `auth_sessions`, `audit_events`, `security_rate_limits`, `inventory_lots`, `inventory_movements`, and `lab_usage_records` are normalized D1 tables.
- Apply D1 migrations before deploying Worker code that depends on new normalized tables.
- Cookie-authenticated mutating API requests require `X-CSRF-Token`. The frontend obtains the token from `login`, `signup`, or `me` and keeps it in memory only.
- Keep documents and generated PDFs out of D1. Store document files in R2 and keep only metadata/signed URL evidence in D1.
- For high-volume production, continue normalizing documents, orders, production batches, billing/subscriptions, and tenant-owned configuration.

