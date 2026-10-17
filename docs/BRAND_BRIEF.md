# Okeanós: brand brief

Source material for the Okeanós website. The Instagram account is
[@okeanosjewels](https://www.instagram.com/okeanosjewels/).

> **Status: incomplete.** Instagram (and the web generally) was not reachable from
> the build environment on 2026-10-17. Its network policy refused connections to
> `www.instagram.com`. The facts below come from the brand image the client shared
> and from web search. Everything marked **TO CONFIRM** still needs to be checked
> against the Instagram profile or the client before it goes on the site. No
> product data has been invented.

---

## 1. What we know (verified)

| Item | Value | Source |
|---|---|---|
| Brand name | **OKEANÓS** (acute accent on the final O) | Wordmark image |
| Instagram handle | `@okeanosjewels` | Client |
| Category | Jewellery | Handle |
| Name meaning | Ōkeanós (Ὠκεανός) is the Greek Titan of the world-ocean, the river that circles the earth. The name suggests sea, water, circularity and permanence. | Greek mythology |

### Wordmark (from `assets/brand/instagram-wordmark-reference.jpg`)

- **Typeface style:** a high-contrast Didone serif in all caps (Didot/Bodoni
  family): hairline serifs, vertical stress, wide letter spacing. The client
  should supply the original font or a vector file. **TO CONFIRM**
- **Ink colour:** deep ocean navy, sampled at **`#032537`**.
- **Art direction:** a single white impasto brushstroke, with visible bristle
  ridges, on a flat cool-grey plaster wall (`#D7D7D7`). The stroke trails off
  into dry-brush texture at the bottom. Monochrome, quiet, tactile and gallery-like.
- **Composition:** the wordmark sits across the brushstroke, about 52% down the
  frame. The stroke is vertical and slightly off-centre.

This one image sets the whole visual language: **cool mineral greys, navy ink,
white texture, plenty of empty space.** There is no warm cream, no gold foil and
no pastels.

---

## 2. Unconfirmed lead (do not publish until confirmed)

Search found a jewellery brand called **"Ōkeanós Jewellery"** at
[okeanosjewellery.co](https://www.okeanosjewellery.co/customer-care-policies). Its
accented spelling matches the wordmark. If it is the same brand, its policy page says:

- Materials: 304 and/or 316L stainless steel with 18K gold plating
- Many pieces are waterproof, tarnish-resistant and hypoallergenic
- A lifetime colour warranty, a 6-month warranty and a 30-day replacement guarantee
- Care: avoid harsh chemicals, take pieces off for heavy exercise and sleep,
  and store them somewhere cool and dry
- Contact: listed on that page

**TO CONFIRM with the client** that @okeanosjewels and okeanosjewellery.co are the
same business. Several unrelated brands use similar names, so do not treat this as
a match yet: Okeanos Creations (Athens, wire jewellery), Oceano Jewels (Mauritius,
pearls) and Okeanos (Florida). None of their details go into this brief.

---

## 3. Information still needed from Instagram or the client

Copy these from the profile. The site cannot ship without the items marked ★.

**Profile**
- [ ] ★ Display name and bio text, exactly as written
- [ ] ★ Link-in-bio URL (an existing shop, Linktree or WhatsApp?)
- [ ] Follower, following and post counts (for social proof, optional)
- [ ] ★ Location or ships-from country and currency
- [ ] ★ Contact: email, WhatsApp or DM-only, phone
- [ ] Story highlight names. These usually map to collections, "Care", "Reviews"
      and "Shipping".

**Brand**
- [ ] Founder name and story (a short paragraph and a portrait, if they want one)
- [ ] Logo source files (SVG or AI) and the font name
- [ ] Taglines or recurring caption phrases
- [ ] Hashtags they use (for UGC and the feed section)

**Policy**
- [ ] Shipping zones, costs and times
- [ ] Returns and warranty (see section 2 if that lead is confirmed)
- [ ] Payment methods

## 4. Products

**None could be extracted.** Post captions and images were unreachable. Fill in
`docs/products-template.csv`, one row per piece and variant, from the grid or the
client's catalogue.

What the site needs for each product:

| Field | Example (format only) | Notes |
|---|---|---|
| `sku` | `OK-NK-001` | Unique |
| `name` | | Exactly as named on Instagram |
| `collection` | | Highlight name or caption series |
| `category` | necklace / ring / earrings / bracelet / anklet / set | |
| `material` | | Metal and plating |
| `stones` | | Pearl, zircon, shell, none, etc. |
| `waterproof` | yes/no | Only if the brand claims it |
| `price` | | Number only |
| `currency` | | |
| `variants` | | Sizes, lengths, gold or silver tone |
| `stock` | | Or "made to order" |
| `description` | | 1–3 sentences |
| `images` | | At least 3 per product: on plaster, on body, detail |
| `instagram_post_url` | | Links the product to its post |

## 5. Photography direction

Product shots should match the wordmark image so the site feels like one gallery:

- Pieces photographed **on the same grey plaster wall** (`#D7D7D7`), lit from
  the upper left with soft cast shadows
- One on-body shot per piece, desaturated cool grade
- Macro detail shots of the clasp, texture and plating
- A transparent-background PNG or WebP cut-out of every piece. The interactive
  wall (see `FRONTEND_PLAN.md`) hangs these over the WebGL surface and gives
  them a live shadow.
