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

For the local Nest API, set the resulting configuration through the API's supported development secret mechanism. For Cloudflare, store the generated verifier as `SEEDED_ADMIN_PASSWORD_HASH` using Wrangler. The seeded workspace includes representative materials, lots, formulas, production batches, SKUs, customers, quotes, orders, audit events, and analytics records so the primary flows are usable immediately.

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

## Data And Security Notes

- Tenant access, sessions, permissions, and audit events are server-enforced.
- Mutating cookie-authenticated API calls require a CSRF token.
- D1 stores structured operational metadata; document binaries should live in Cloudflare R2 with only metadata and signed-URL evidence persisted in D1.
- Generated functional reports, browser evidence, `.env*` files, and credentials are intentionally ignored by Git.

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
