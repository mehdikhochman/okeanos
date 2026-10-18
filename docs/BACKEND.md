# Backend: how it works

## Shape

```
Browser ──> Vercel CDN ──> api/index.js (Vercel function) ──> Fastify app (src/app.js)
                │                                               ├── GET  /            storefront, cached in memory + 10 s at the edge
                │                                               ├── POST /api/orders  checkout
                │                                               └── /admin/*          admin (server-rendered HTML)
                └── photos from Vercel Blob (CDN)         Turso (hosted SQLite)
```

The same app also runs as a normal Node process (`npm start`) with an SQLite file and a local
photo folder. Development, the tests and any VPS use that mode. `src/config.js` picks the mode from
the environment, and the code is identical.

A jewellery shop with tens of pieces and a few orders a day does not need a database server of
its own, a queue or a front-end framework. Turso keeps the SQLite dialect, so the SQL and the
migrations are the same in both modes.

### What Vercel changes, and how the code handles it

| Vercel constraint | Handling |
|---|---|
| The disk is wiped between requests | Database on Turso, photos on Vercel Blob |
| Several instances run at once | The cached shop page carries a `catalogue_version`; every admin change bumps it, and each instance rebuilds when its copy is older |
| Request bodies over 4.5 MB are refused | The admin shrinks photos in the browser and uploads them one at a time |
| No long-running process | Migrations and the first-time catalogue run at deploy (`npm run vercel-build`); expired sessions are purged at login instead of by a timer |
| Rate limits are per instance | Order spam is also capped per IP per day in the database; login lockout is stored in the database |
| A missing setting used to crash with a blank 500 | `api/index.js` answers with a plain sentence naming the missing settings (never their values) |

## Folders (`server/src`)

| Folder | Holds |
|---|---|
| `config.js` | Environment variables, checked at start-up |
| `app.js`, `server.js` | Wiring and the HTTP listener |
| `db/` | Opening SQLite and running `migrations/*.sql` in order |
| `repositories/` | All SQL, one file per feature (pieces, orders, users…) |
| `routes/public.js`, `routes/place-order.js` | Storefront, media, checkout |
| `routes/admin/` | One file per admin section |
| `admin-ui/` | Admin HTML views, CSS and the small enhancement script |
| `storefront/` | The shop page template, its script, and the renderer |
| `plugins/` | Auth/CSRF, security headers, error pages |
| `lib/` | Escaping, crypto, form validation, images, formatting |

## Placing an order

1. The shopper's bag lives in their browser (`localStorage`), so adding pieces never touches the network.
2. The checkout sends JSON to `POST /api/orders`: name, phone, email (optional), city, address, note,
   an optional GPS point, the pieces and an *idempotency key*.
3. The server checks the body against a strict schema. Unknown fields are rejected, not stripped.
   It re-reads every piece, option and **price from the database**, so a tampered browser cannot
   change prices. It writes the order and its lines in one transaction and returns a number like `OK-1001`.
4. A double click or a retry with the same key returns the same order instead of creating a second one.
5. The order appears in the admin with the map pin and a WhatsApp link to the customer.

Payment is assumed to be **cash on delivery**. The wording is in Settings → "How customers pay".
Online payment (for example Areeba or Stripe) can be added later as a step after the order is created.

## Security model

| Threat | Defence |
|---|---|
| Stolen admin password | scrypt hashes, 12-character minimum, lockout after 5 failures, rate-limited login, owners can reset |
| Session theft | Random 256-bit token in an `HttpOnly; Secure; SameSite=Strict` cookie scoped to `/admin`; only its hash is stored; idle and absolute expiry; "log out other devices" |
| CSRF | Per-session token on every admin POST **and** an Origin check |
| XSS | Auto-escaping templates; storefront CSP allows only its own inline script, by SHA-256 hash; admin CSP allows only same-origin scripts; option colours limited to `#rrggbb` |
| SQL injection | Prepared statements only |
| Malicious uploads | Upload parsing only after authentication; size limit (4 MB on Vercel, 15 MB self-hosted); every file decoded and re-encoded by sharp (strips EXIF/GPS, rejects non-images); random content-hash names; media URLs restricted to that pattern |
| Order spam | Strict schema, honeypot field, 5 orders per 10 min per IP, 10 per day per IP (stored as a keyed hash, not the raw IP) |
| Spreadsheet formula injection | CSV cells starting with `= + - @` are prefixed with `'` |
| Clickjacking, sniffing | `frame-ancestors 'none'`, `X-Frame-Options`, `nosniff`, strict referrer and permissions policies, HSTS in production |
| Privilege misuse | Owner/editor roles checked in routes; the last owner cannot be removed; full activity log |

Each row has at least one test in `server/test/`.

## Speed

Measured on the development container (`npm run bench`, 20 simultaneous visitors):

| Request | p50 | p95 |
|---|---|---|
| Shop page, first visit (Brotli, ~21 kB, local mode) | 22.6 ms | 37.7 ms |
| Shop page, returning visitor (304) | 4.4 ms | 8.9 ms |

On Vercel most visitors get the page from the CDN edge (it caches it for 10 seconds), and the
first request to a fresh instance includes a cold start (~1 s).

Measured in a headless phone browser against the running server:

| Interaction | Time |
|---|---|
| Page ready | ~200 ms |
| Tap a piece → product sheet open | 7.5 ms (no network) |
| Place order → confirmation | 24 ms round trip |
| Admin page navigation | instant when prefetched on hover (Speculation Rules) |

How:
- The page is rendered and compressed once per catalogue change and then served from memory.
- The whole catalogue is embedded, so filters, search, product sheets and the bag never wait on the network.
- Fonts are self-hosted, so there are no third-party connections.
- Images are WebP in two widths with `srcset`, served with `immutable` caching.
- The admin is plain HTML, with links prefetched on hover.

## Dependencies and why

| Package | Why |
|---|---|
| `fastify` | Fast HTTP server with built-in schema validation and logging |
| `@fastify/cookie`, `formbody`, `multipart`, `static`, `rate-limit` | Official plugins for cookies, forms, uploads, files and rate limits; less security-critical code of our own |
| `@libsql/client` | One driver for a local SQLite file and for Turso |
| `@vercel/blob` | Photo storage on Vercel |
| `sharp` | Safe, fast image decoding and WebP encoding |

## Still to decide with the client

- Payment: cash on delivery assumed. Online payment?
- Delivery fee and areas: empty means "confirmed by phone".
- Prices, piece names marked "working name", WhatsApp number: all set from the admin.
- Order notifications: today the dashboard shows new orders. An email, WhatsApp or Telegram alert
  per order needs an account with one of those services.
