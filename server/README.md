# Ōkeanós shop server

The storefront customers order from, plus the admin the team runs the shop with.
One small Node.js process with an SQLite database file and an images folder.
There is nothing else to install or keep running.

- How it is built and why: [`../docs/BACKEND.md`](../docs/BACKEND.md)
- Rules every change follows: [`../docs/CODING_RULES.md`](../docs/CODING_RULES.md)

## Run it on your computer

Needs Node.js 22.9 or newer.

```bash
cd server
npm install
cp .env.example .env              # defaults are fine for local use
npm run seed                      # loads the 11 pieces, photos, lookbook and guide from Instagram
npm run create-owner -- "you@example.com" "Your Name"   # prints a password once
npm run dev                       # http://localhost:3000 and http://localhost:3000/admin
```

Open the site at the exact address in `PUBLIC_ORIGIN` (by default `http://localhost:3000`).
For example, `127.0.0.1:3000` would fail the admin's same-site check.

## Checks

```bash
npm test        # 32 tests: security rules, ordering, storefront, admin
npm run bench   # response times of the shop page (server must be running)
```

## Put it online

Any small Linux server (1 vCPU / 1 GB is plenty) or a platform with a persistent disk.

1. Install Node 22 and copy the `server` folder. Run `npm ci --omit=dev`.
2. Create `.env` from `.env.example` with:
   `NODE_ENV=production`, `PUBLIC_ORIGIN=https://your-domain`, `TRUST_PROXY=true`,
   a random `IP_HASH_SECRET` and `DATA_DIR=/var/lib/okeanos`.
3. Put [Caddy](https://caddyserver.com) in front for automatic HTTPS:
   ```
   your-domain {
     encode zstd gzip
     reverse_proxy 127.0.0.1:3000
   }
   ```
4. Run `npm run seed`, then `npm run create-owner`, then keep `npm start` running with systemd (or pm2).
5. **Back up `DATA_DIR`** daily. It holds `okeanos.db` and the `media/` photos.
   The admin's Backup page also downloads the database on demand.

## The admin at a glance

| Page | What you do there |
|---|---|
| Dashboard | New orders to confirm, sales, most ordered pieces, pause/resume orders in one click |
| Orders | Filter by status and search. Each order shows the customer, a WhatsApp/Call button, the address and the map pin. Move it through *New → Confirmed → Being made → Out for delivery → Delivered*. You can add private notes, print a delivery slip and export to CSV |
| Pieces | Add, edit, duplicate, archive. Prices, badges, "New in", sold out, options with colour dots, collections, photos (cut-outs and photos), order in the shop, bulk actions |
| Categories / Collections | The shop's menu and filters |
| Lookbook | The photos of pieces being worn |
| Guide | The care, sizing and returns questions |
| Settings | Announcement, texts, currency, delivery fee, payment note, WhatsApp number, policies, SEO *(owners)* |
| Team | Add people as *owner* or *editor*, reset passwords *(owners)* |
| Activity | Who changed what, and when |
| Backup | Download the database and the orders spreadsheet *(owners)* |

Keyboard: **Ctrl/⌘ + S** saves the piece or settings form you are on.
