# Sync Cart

A real-time collaborative grocery cart (Instamart-style). One person starts a cart and shares a link or QR code, and
everyone adds items from their own phone. Each addition appears on every screen within a second. Items are
**Shared** or **Personal**. When two people add the same shared product, it is flagged, and the host merges,
keeps or removes the extra copy. The host checks out and pays, and each member then owes an equal share of the shared items plus their own
personal items.

## Features

- Start a cart with just a name; invite by link, QR code, phone share sheet or WhatsApp
- Join with a display name only (no accounts), up to 10 people per cart
- Seeded catalog of 30 products; live add / change quantity / remove / retag
- Live presence (who's online) and a Live / Reconnecting indicator
- Duplicate detection for shared items; host-only Merge / Keep all / Remove
- Shared items are split equally between everyone; personal items are paid by whoever added them
- Merges keep each person's contribution, so the order history always shows who added what
- Host-only checkout; settlement per member; live "Mark as paid"
- Everything persisted in PostgreSQL; refresh or reconnect restores identical state
- Redis-backed Socket.io adapter, so several server instances can share one cart

## Architecture

```
React (Vite) ──REST (changes + snapshot)──► Express ─► services ─► PostgreSQL
     ▲                                          │   (one advisory lock per cart)
     └──────── Socket.io (events only) ◄────────┴── Redis pub/sub ◄── other instances
```

1. **REST writes, socket reads.** Every change is a REST call; sockets only push the result.
2. **One lock per cart.** Each write runs in a transaction holding `pg_advisory_xact_lock(cart)`, so two
   simultaneous adds can't both miss the duplicate.
3. **Revisions.** Each committed change bumps the cart's `revision` and emits exactly one event with it. Clients
   apply `rev = current + 1`, ignore older revisions, and reload the snapshot when they find a gap.
4. **Emit after commit.** Services return `{ result, event }`, and routes broadcast only after the transaction commits.
5. **Redis adapter.** Events published on one instance reach sockets on every instance. Without Redis the server
   falls back to an in-memory adapter (single instance).

Details are in [Claude/DESIGN.md](Claude/DESIGN.md).

## Prerequisites

- Node.js 20+ (tested on 24)
- PostgreSQL 15+ and (optionally) Redis 7, either through Docker (`docker compose up -d`) or installed locally
  (for example the PostgreSQL Windows installer, and Memurai for Redis on Windows)

## Quick start

```bash
docker compose up -d                                   # or use your local Postgres/Redis
cd server && npm i && npm run db:setup && npm run dev   # API + sockets on :4000
cd client && npm i && npm run dev                       # app on :5173
```

Without Docker, create the database login once, as the `postgres` superuser:

```sql
CREATE ROLE synccart LOGIN PASSWORD 'synccart' CREATEDB;
CREATE DATABASE synccart OWNER synccart;
```

`npm run db:setup` then migrates, seeds the 30 products and creates `synccart_test`. It is safe to run twice.

## Environment variables

`server/.env` (copy from `.env.example`):

| Var | Default | Meaning |
|---|---|---|
| `PORT` | `4000` | HTTP + socket port |
| `DATABASE_URL` | `postgres://synccart:synccart@localhost:5432/synccart` | Main DB |
| `TEST_DATABASE_URL` | `postgres://synccart:synccart@localhost:5432/synccart_test` | Used by `npm test` |
| `REDIS_URL` | `redis://localhost:6379` | Empty ⇒ in-memory adapter + presence |
| `CLIENT_ORIGIN` | `http://localhost:5173` | CORS origin and base of invite links |
| `LOG_LEVEL` | `info` | pino level |

`client/.env`: `VITE_API_URL=http://localhost:4000`.

## Try it with two devices

Put the laptop and phone on the same Wi-Fi. Set `CLIENT_ORIGIN=http://<LAN-IP>:5173` in `server/.env` and
`VITE_API_URL=http://<LAN-IP>:4000` in `client/.env`, then run the client with `npm run dev -- --host`. Start a
cart on the laptop, open **Invite**, and scan the QR code with the phone.

## Running two server instances

With Redis running:

```bash
cd server
PORT=4000 npm start          # terminal 1
PORT=4001 npm start          # terminal 2
cd ../client
VITE_API_URL=http://localhost:4000 npm run dev -- --port 5173
VITE_API_URL=http://localhost:4001 npm run dev -- --port 5174
```

Join the same cart from both client ports. An item added on one appears on the other, even though each browser
is connected to a different server. (On Windows PowerShell, set variables with `$env:PORT=4001; npm start`.)

## API reference

All paths are prefixed with `/api`. Auth means the `X-Member-Token` header is required. Full request/response JSON is in
[Claude/SRS.md §3.6](Claude/SRS.md).

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | – | DB + Redis status |
| GET | `/catalog` | – | Products |
| POST | `/sessions` | – | Create cart + host |
| GET | `/sessions/:token/preview` | – | Join-screen info |
| POST | `/sessions/:token/join` | – | Join as member |
| GET | `/sessions/:token/state` | ✓ | Full snapshot |
| GET | `/sessions/:token/invite` | ✓ | Link + QR |
| POST | `/sessions/:token/items` | ✓ | Add item |
| PATCH | `/sessions/:token/items/:itemId` | ✓ | Change my quantity / tag |
| DELETE | `/sessions/:token/items/:itemId` | ✓ | Remove my part |
| POST | `/sessions/:token/duplicates/:groupId/resolve` | host | Merge / keep all / remove |
| POST | `/sessions/:token/checkout` | host | Host pays, cart locks |
| GET | `/sessions/:token/settlement` | ✓ | Who owes what |
| PATCH | `/sessions/:token/members/:memberId/paid` | ✓ | Mark paid |

Errors are always returned as `{ "error": { "code", "message" } }`. Socket events: `cart:event` (one per change) and `presence:update`.

## Tests

```bash
cd server && npm test
```

The tests run with Jest and supertest against `synccart_test`, with Redis disabled. They cover contribution merging and capping,
duplicate rules and all three resolutions, items (BR-05 growth, the 20 cap, own-part-only edits, retagging), sessions
(create/join/full/auth/QR), settlement (the SRS worked example and paid → settled), 20 concurrent adds producing
exactly one flagged group with gap-free revisions, and two socket clients receiving the same event.

## Design decisions

See the Decisions table in [Claude/PROGRESS.md](Claude/PROGRESS.md). The key ones are REST writes with socket
reads (D1), one advisory lock per cart (D2), revisions (D3), pay-for-what-you-added (D9), host-only duplicates
and checkout (D10, D11), and a contributions table so merges never change a bill (D12).

## Out of scope / roadmap

Real payments, reminders, accounts, equal or custom splits, native contact access and a real catalog API are all out of
scope. Ideas for later: UPI "pay back" links, custom split ratios, reminders.

## Build log

Every build step, decision and bug fix is explained in plain language in [Claude/PROGRESS.md](Claude/PROGRESS.md).
