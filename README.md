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
