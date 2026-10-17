# Okeanós: brand brief

Source material for the Okeanós website, taken from
[@okeanosjewels](https://www.instagram.com/okeanosjewels/) on 2026-10-17.

> **Coverage.** Without logging in, Instagram returns the profile and the
> **12 most recent of 38 posts** (2025-07-19 → 2025-07-29). The 26 older posts,
> the 7 story highlights and comments require a login and were not read. Post
> images are served from `*.cdninstagram.com`, which the build environment's network
> policy still blocks, so the product descriptions below come from captions only.
> Items marked **TO CONFIRM** need the client or a logged-in look. Nothing has
> been invented.

---

## 1. Profile (verified)

| Item | Value |
|---|---|
| Display name | **Ōkeanós** (macron on the first O, acute on the second) |
| Handle | `@okeanosjewels` |
| Bio | "Beirut, Lebanon / 18k Gold Plated & Stainless Steel Jewelry / Dm to Place Your Orders!" |
| Location | Beirut, Lebanon |
| Materials | 18k gold-plated stainless steel. One post also mentions **rose gold**. |
| Instagram category | Design & fashion (professional account, not verified) |
| Ordering | **By Instagram DM only.** No link in bio, website, email or phone on the profile. |
| Followers / following / posts | 206 / 0 / 38 |
| Story highlights | 7 (names and contents need a login, **TO CONFIRM**) |
| Latest post | 2025-07-29. Nothing posted for about 15 months. **Confirm the current catalogue with the client.** |
| Prices | **Never shown publicly.** None in captions, and comments were not readable. |

### Voice and mood (from captions)

- Short, lowercase product names: "cluster earrings", "organic rings", "new in".
- Summer, social and playful: 🪭 🥂 🌤️ 🍒 🌺 ✨ 🌿, with "Match with your friend!" and
  "Your favorite hand chain is back!"
- Recurring phrases: "Available now", "New in", "Dm for orders".
- Reels use Afro-house and Arabic pop: *Yamore* (MoBlack, Salif Keïta, Cesária
  Évora) and *Tamally Maak* (Amr Diab). The audience is Lebanese and Mediterranean,
  young, and dressing for summer evenings out.

So the brand has two sides: the **wordmark image is cool, minimal and gallery-like**,
and the **feed is warm, summery and social**. The site plan joins them with the
grey plaster and navy as the frame and the gold pieces as the warmth (see
`FRONTEND_PLAN.md`).

### Wordmark (from `assets/brand/instagram-wordmark-reference.jpg`)

- **Typeface:** a high-contrast Didone serif in all caps (Didot or Bodoni
  style) with wide letter spacing. Ask the client for the original font or an SVG.
- **Ink:** deep navy **`#032537`** on a cool-grey plaster wall, **`#D7D7D7`**.
- **Art direction:** a single vertical white impasto brushstroke with visible bristle
  ridges, trailing off into dry-brush texture at the bottom. The wordmark sits
  across it.

---

## 2. Products seen in the 12 most recent posts

Names are exactly as captioned. "Unnamed" means the caption gives no product name.

| # | Product | Type | Notes | Posts |
|---|---|---|---|---|
| 1 | **Hand chain** | Hand chain | Called "our best selling hand chain" and "Your favorite hand chain is back!" (it was restocked) | [DMYERJ6MmlI](https://www.instagram.com/p/DMYERJ6MmlI/), [DMflnuQMd3h](https://www.instagram.com/p/DMflnuQMd3h/) |
| 2 | **Summer hoops** | Earrings (hoops) | "Match with your friend!" Styled with the hand chain. | [DMSkuxiMeaq](https://www.instagram.com/p/DMSkuxiMeaq/), [DMYERJ6MmlI](https://www.instagram.com/p/DMYERJ6MmlI/) |
| 3 | **Loop Bangle** | Bangle | | [DMnLeyDsuVS](https://www.instagram.com/p/DMnLeyDsuVS/) |
| 4 | **Cluster earrings** | Earrings | | [DMflv7RM8FC](https://www.instagram.com/p/DMflv7RM8FC/) |
| 5 | **Era earrings** | Earrings | | [DMVYxotMCLq](https://www.instagram.com/p/DMVYxotMCLq/) |
| 6 | **Flowers earrings** | Earrings | | [DMSk5HlsS_K](https://www.instagram.com/p/DMSk5HlsS_K/) |
| 7 | **Organic rings** | Rings | Plural, so probably several designs (3 photos) | [DMYZPxmMPJS](https://www.instagram.com/p/DMYZPxmMPJS/) |
| 8 | **Rose gold rings** | Rings | "Our new rose gold rings", 4 photos | [DMVYoCYsFC8](https://www.instagram.com/p/DMVYoCYsFC8/) |
| 9 | Unnamed bangles, ring and earrings | Bangles, ring, earrings | "New pieces to complete your summer look". May include the Loop Bangle. | [DMnLYtns6xk](https://www.instagram.com/p/DMnLYtns6xk/) |
| 10 | Unnamed earrings and necklace | Earrings, necklace | Launched alongside the hand chain restock | [DMflnuQMd3h](https://www.instagram.com/p/DMflnuQMd3h/) |
| 11 | Unnamed, "Available now" | ? | 4 photos | [DMsDbsas31f](https://www.instagram.com/p/DMsDbsas31f/) |
| 12 | Unnamed, "new in" | ? | 2 photos | [DMs6LVlMzue](https://www.instagram.com/p/DMs6LVlMzue/) |

**Categories the site needs:** earrings (hoops, cluster, statement), rings,
bangles, hand chains and necklaces.

`docs/products-template.csv` is pre-filled with these rows. Prices, variants, stock
and descriptions are blank because they aren't public.

---

## 3. Unconfirmed lead: okeanosjewellery.co

[okeanosjewellery.co](https://www.okeanosjewellery.co/customer-care-policies)
uses **the same spelling, "Ōkeanós"**, and the **same materials** (stainless steel
with 18K gold plating). That makes it a probable match, but the Instagram profile
doesn't link to it. If the client confirms it, its policy page adds:

- Steel grade: 304 and/or 316L, depending on the design
- Many pieces are waterproof, tarnish-resistant and hypoallergenic
- A lifetime colour warranty, a 6-month warranty and a 30-day replacement guarantee
- Care: avoid harsh chemicals, take pieces off for heavy exercise and sleep,
  and store them somewhere cool and dry

The environment also blocks this site. Add `www.okeanosjewellery.co` to the
allowed domains to pull its catalogue.

---

## 4. Still needed from the client

★ = the site can't launch without it.

- [ ] ★ Confirm okeanosjewellery.co is theirs, and whether it is still live
- [ ] ★ **Prices** (LBP, USD or both?), variants, stock and the current catalogue
      (the feed is about 15 months old)
- [ ] ★ How orders work on the site: keep DM/WhatsApp ordering, or add a cart and
      checkout? This decides the commerce architecture.
- [ ] ★ Delivery: Lebanon only or international? Cost and cash on delivery?
- [ ] ★ Contact: WhatsApp number and email
- [ ] The 7 highlight names, which likely map to collections or info pages
- [ ] The 26 older posts (products and names)
- [ ] Logo source file and font
- [ ] Original product photos (see section 5). Instagram's copies are compressed and cropped.
- [ ] Founder story, if they want an About page

## 5. Photography direction

- Shoot every piece **on the same grey plaster wall** (`#D7D7D7`), lit from the
  upper left with a soft cast shadow, so it matches the wordmark image.
- One on-body shot per piece, keeping the warm summer feel of the feed.
- Macro detail shots of the plating and texture.
- A transparent PNG or WebP cut-out of every piece. The interactive wall in
  `FRONTEND_PLAN.md` hangs these and gives them a live shadow.
