# Backend: how it works

## Shape

```
Browser ──HTTPS──> Caddy ──> Node 22 + Fastify (one process)
                                 ├── GET  /            storefront, served from memory
                                 ├── GET  /media/*     photos (WebP, cached 1 year)
                                 ├── POST /api/orders  checkout
                                 └── /admin/*          admin (server-rendered HTML)
                              SQLite file (WAL) + data/media/ folder
```

A jewellery shop with tens of pieces and a few orders a day does not need a separate
database server, a queue or a front-end framework. Every extra moving part would add
latency, cost and attack surface. If the shop ever outgrows SQLite, the repositories
are the only files that talk to the database.

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
| Malicious uploads | Upload parsing only after authentication; 15 MB limit; every file decoded and re-encoded by sharp (strips EXIF/GPS, rejects non-images); random content-hash names; media URLs restricted to that pattern |
| Order spam | Strict schema, honeypot field, 5 orders per 10 min per IP, 10 per day per IP (stored as a keyed hash, not the raw IP) |
| Spreadsheet formula injection | CSV cells starting with `= + - @` are prefixed with `'` |
| Clickjacking, sniffing | `frame-ancestors 'none'`, `X-Frame-Options`, `nosniff`, strict referrer and permissions policies, HSTS in production |
| Privilege misuse | Owner/editor roles checked in routes; the last owner cannot be removed; full activity log |

Each row has at least one test in `server/test/`.

## Speed

Measured on the development container (`npm run bench`, 20 simultaneous visitors):

| Request | p50 | p95 |
|---|---|---|
| Shop page, first visit (Brotli, ~21 kB) | 22.6 ms | 37.7 ms |
| Shop page, returning visitor (304) | 4.4 ms | 8.9 ms |

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
| `better-sqlite3` | Mature, synchronous, fast SQLite driver |
| `sharp` | Safe, fast image decoding and WebP encoding |

## Still to decide with the client

- Payment: cash on delivery assumed. Online payment?
- Delivery fee and areas: empty means "confirmed by phone".
- Prices, piece names marked "working name", WhatsApp number: all set from the admin.
- Order notifications: today the dashboard shows new orders. An email, WhatsApp or Telegram alert
  per order needs an account with one of those services.
