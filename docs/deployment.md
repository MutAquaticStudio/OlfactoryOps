# OlfactoryOps Deployment

This repo is split into two deployable surfaces:

- Frontend: Vite static app, suitable for Cloudflare Pages.
- API: NestJS/Fastify Node server, suitable for Render, Fly.io, Railway, Koyeb, or another Node host.

Supabase can provide the production Postgres database. The current North Star API still serves the app from the in-memory domain service, so `DATABASE_URL` is deployment-ready but not yet used for persistence until the Prisma-backed service phase is implemented.

## Recommended Free/Low-Cost Setup

Use these hostnames with your Cloudflare zone:

- `app.yourdomain.com` for Cloudflare Pages.
- `api.yourdomain.com` for the Node API host.

## Frontend: Cloudflare Pages

Create a Pages project connected to the GitHub repo.

- Framework preset: `Vite`
- Build command: `npm ci && npm run build`
- Build output directory: `dist`
- Production environment variable:

```bash
VITE_API_BASE_URL=https://api.yourdomain.com/api/v1
```

The repo includes:

- `public/_redirects` for SPA fallback.
- `public/_headers` for baseline browser security headers.

After the first successful Pages deploy, add `app.yourdomain.com` under the Pages project's custom domains.

## API: Node Host

The repo includes `render.yaml` for Render Blueprint deployment. For any Node host, use:

```bash
npm ci && npm run build:api
npm run start:api
```

Production environment variables:

```bash
NODE_VERSION=22
HOST=0.0.0.0
PORT=<provided by host>
CORS_ORIGINS=https://app.yourdomain.com
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE?schema=public
```

Health check path:

```bash
/api/v1/health
```

Once the host gives you a service URL, add `api.yourdomain.com` in Cloudflare DNS as a CNAME to that service hostname. Keep HTTPS enabled.

## Supabase

Create a Supabase project and copy the Postgres connection string into `DATABASE_URL` on the API host. Keep the password only in the host's secret environment settings.

Use the direct connection string for migrations from a trusted local machine or CI. Use the pooler connection string for serverless or connection-constrained environments.

## Pre-Deploy Checks

Run locally before deploying:

```bash
npm run deploy:check
```

For a live smoke test after deployment:

```bash
curl https://api.yourdomain.com/api/v1/health
```

Then open `https://app.yourdomain.com`, log in with the current demo login, and verify dashboard data loads from the deployed API.
