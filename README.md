# PingCheck API

NestJS backend for [PingCheck](https://github.com/YUKIF69/pingcheck-web), an uptime monitoring SaaS.

**Live API docs (Swagger):** https://pingcheck-api.onrender.com/api
**Full project overview and demo:** see the [web repository](https://github.com/YUKIF69/pingcheck-web)

## Stack

NestJS, Prisma, PostgreSQL (Supabase), Passport JWT, @nestjs/schedule, Socket.io, Stripe, Resend

## Modules

- `auth`: register/login, JWT strategy and guard
- `monitors`: CRUD, stats, public status endpoint
- `scheduler`: cron job that pings active monitors and creates/resolves alerts
- `gateway`: WebSocket gateway that pushes live status to the dashboard
- `notifications`: downtime/recovery emails via Resend
- `stripe`: checkout session and webhook that activates the premium plan
- `users`: subscription status

## Run locally

```bash
npm install
cp .env.example .env   # see variables below
npx prisma migrate deploy
npm run start:dev      # http://localhost:4000, Swagger at /api
```

Env variables: `DATABASE_URL`, `JWT_SECRET`, `FRONTEND_URL`, `RESEND_API_KEY`, `RESEND_FROM`, `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`

Stripe webhook locally: `stripe listen --forward-to localhost:4000/stripe/webhook`

## Security notes and known limitations

**Implemented:**

- SSRF protection for monitored URLs: only http/`https`, private and reserved IP ranges are
  blocked (including cloud metadata addresses), redirects are followed manually and every hop is
  validated
- WebSocket connections require a valid JWT and are scoped to per-user rooms, so users only receive
  updates for their own monitors
- Free/Premium limits are enforced on the server, not only in the UI
- Rate limiting on /auth endpoints (5 registrations and 10 logins per minute per IP)
- Ping log retention: logs older than 31 days are deleted daily; composite indexes for stats queries

**Known limitations (MVP):**

- DNS rebinding: the URL is validated before the request, but DNS is resolved again by fetch,
  so a hostile DNS server could still change the answer in between. A full fix needs a custom
  DNS-pinned HTTP agent
- JWT in localStorage: simple for an MVP, but exposed to XSS. A production version would use
  short-lived access tokens with refresh tokens in HttpOnly cookies
- No token revocation: logout only removes the token on the client; JWTs are valid for 7 days
- Hosting: the API runs on a free Render instance and is kept awake by an external ping, so
  checks can be missed during restarts. This is a demo, not an SLA
- Stripe: only checkout.session.completed is handled; cancellations and failed renewals are
  not synced yet
- Stats: the stats endpoint returns raw ping logs for the last 30 days. Aggregation is planned.
