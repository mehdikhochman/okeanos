# Okeanós: frontend and motion plan

Builds on `BRAND_BRIEF.md`. The concept comes from the one image the brand has
published: **a white brushstroke on a grey plaster wall.** The site *is* that
wall. Light moves across it with the visitor, and the jewellery hangs on it.

---

## 1. Concept: "The Wall"

Most jewellery sites are white pages with product cards. Okeanós is a wall in a
gallery:

- The background is a **live WebGL relief surface**: grey plaster with a white
  impasto stroke. The pointer is a **raking light**. As it moves, the bristle
  ridges catch highlights and cast micro-shadows, so the texture shows only when
  the visitor touches it. On touch devices, device tilt (or a slow automatic
  drift) moves the light.
- Each jewellery piece is a cut-out PNG **hung on the wall** with a real-time
  shadow from the same light. One light source makes the page and the products
  look like the same physical space.
- **Water, sparingly.** Okeanós is the world-ocean. A fast pointer movement leaves
  a short ripple in the still-wet paint: a height-field wave added to the relief
  that settles within about a second. This is the only nod to the sea, and only
  the visitor's own action triggers it.

**Where the boldness goes:** the lit relief surface. Everything else stays
quiet: navy type, generous space, no cards, no gradients, no decoration.

## 2. Tokens

### Colour

| Token | Hex | Role |
|---|---|---|
| `--plaster` | `#D7D7D7` | Page ground (sampled from the wordmark image) |
| `--stroke` | `#EEEEEC` | Raised paint, panels, input fills |
| `--abyss` | `#032537` | Wordmark, headings, body text, primary buttons (11.0:1 on plaster) |
| `--tide` | `#2B5470` | Links, hover, focus ring (5.6:1 on plaster) |
| `--silt` | `#4A565E` | Secondary text, prices, meta (5.2:1 on plaster) |
| `--shade` | `#A9ADB0` | Relief shadows and hairlines only. Never used for text. |

Every text pairing passes WCAG AA. The catalogue is confirmed as 18k gold and
rose-gold plating, so the light has a warm specular tint (`--gilt` `#B8975A`)
that appears only where it catches a hung piece. This brings the summer warmth
of the feed onto the cool wall. Text never uses it, because it fails contrast
on plaster.

### Type

- **Display:** *Bodoni Moda* (Google Fonts, variable optical size). It is the
  closest free match to the Didone wordmark. Use it for the wordmark, product
  names and the few large headlines, with the opsz axis at its maximum and generous
  tracking on the logotype only. If the client supplies the original wordmark
  font, use that instead.
- **Text:** *Instrument Sans*, a narrow, calm grotesque that contrasts clearly
  with the Didone and suits prices, UI and body copy.
- **Scale:** a 1.333 (perfect fourth) modular scale from 17px. Body line-height is 1.55
  and the measure stays at or under 66 characters.
- **Case:** sentence case everywhere except the wordmark. No tracked-out
  all-caps labels.

### Layout and alignment

The wordmark image is centred and vertical, so the hero and product pages use a
**centred vertical axis**. Reading text (story, care, policies) is left-aligned
in a single narrow column that sits on that axis.

```
HERO (100svh)                         COLLECTION WALL (scroll)
┌──────────────────────────────┐      ┌──────────────────────────────┐
│ ≡                        bag │      │            Rings             │
│                              │      │                              │
│             ║║║              │      │    ◦            ◦            │
│             ║║║              │      │   piece      piece           │
│        O K E A N Ó S         │      │        ◦            ◦        │
│             ║║║              │      │      piece        piece      │
│             ║░║              │      │  (staggered "salon hang",    │
│              ░               │      │   not a grid of cards)       │
│        Explore pieces        │      │                              │
└──────────────────────────────┘      └──────────────────────────────┘

PRODUCT                               MOBILE PRODUCT
┌──────────────────────────────┐      ┌──────────────┐
│   [piece hung on wall,  ]    │ Name │  [piece]     │
│   [light follows cursor ]    │ Price│  Name  Price │
│                              │ Opts │  Options     │
│                              │ Add  │  Add to bag  │
│                              │ Care │  Care ▾      │
└──────────────────────────────┘      └──────────────┘
```

Collection pages use a **salon hang**: pieces at varied sizes and vertical
offsets, as on a gallery wall, laid out with CSS Grid using explicit row and
column spans. A strict product grid would look like every other shop.

### Principles

1. **One light.** The relief, the hung pieces and the hover states all respond
   to the same light position.
2. **Touch reveals texture.** At rest the wall is almost flat and grey, like the
   photo. Interaction brings it to life.
3. **One orchestrated moment.** On first load, the brushstroke paints downward
   (about 1.4s), then the wordmark resolves across it. After that, motion only
   responds to the visitor.
4. **Quiet commerce.** Price, options and "Add to bag" are plain, legible and
   never animated for effect.

### Review against generic defaults

| Risk | Decision |
|---|---|
| Cream background with a serif display | Rejected. The ground is cool mineral grey taken from the brand image, not cream. |
| A product-card grid with rounded cards and drop shadows | Replaced with the salon hang and light-driven shadows. No cards. |
| Fade-up on every section | Removed. There is one load sequence. Scroll only moves the light gently. |
| All-caps eyebrows over every heading | None. Headings stand alone. |
| A generic "ocean waves" hero | Rejected as a cliché. Water appears only as a ripple the visitor causes in wet paint. |

## 3. Technical approach

| Concern | Choice | Why |
|---|---|---|
| Framework | **Next.js (App Router) + TypeScript** | SEO for product pages, image optimisation, an easy route to headless commerce |
| Commerce | **Phase 1: "Order on WhatsApp/DM".** The bag builds a pre-filled WhatsApp message (piece, variant, quantity) from a static catalogue. **Phase 2 (optional):** headless Shopify with cash on delivery | Today the brand only takes orders by DM in Beirut, so phase 1 matches how they already sell. Record the choice as an ADR with `engineering:architecture`. |
| WebGL | **three.js via React Three Fiber**, one full-screen plane with a custom shader | One canvas fixed behind the page, shared by every route |
| Animation | **GSAP** (load sequence, ScrollTrigger light drift) + **Lenis** smooth scroll | Precise timeline control for the single intro moment |
| Styling | CSS Modules + CSS custom properties (the tokens above) | Tokens shared by the CSS and the shader uniforms |
| Fonts | `next/font` (self-hosted Bodoni Moda and Instrument Sans) | No layout shift |

### The relief shader

- **Height field** `h(uv)` = plaster (low-amplitude fbm noise) + stroke mask ×
  (anisotropic noise stretched along y for bristle ridges, plus a soft edge
  bulge). The dry-brush tail breaks the mask up with thresholded noise near the bottom.
- **Normals** come from finite differences of `h`. Lighting is Lambert plus a
  soft specular term from a point light at `(pointer.xy, z)`. The light position is
  lerped so it trails the pointer smoothly.
- **Paint-in:** a `uProgress` uniform reveals the stroke mask from top to bottom
  during the intro.
- **Wet-paint ripple:** a ping-pong framebuffer at 256² runs a simple wave
  equation fed by pointer velocity. Its output is added to `h` before normals
  are computed.
- **Piece shadows:** each hung piece is a DOM `<img>`. Its alpha mask is also
  drawn into an offscreen shadow texture, offset away from the light, so the
  shadows fall on the wall rather than as CSS shadows.
- **Budget:** cap DPR at 1.5, render at half resolution on mobile, pause with
  `IntersectionObserver` and `visibilitychange`, and target 60fps on a mid-range
  phone.
- **Fallbacks:** with `prefers-reduced-motion`, the ripple and auto-drift are
  off and the light is static. Without WebGL, a pre-rendered still of the wall
  (or a Remotion loop, see below) is used as a CSS background. All content works
  with JS disabled.

### Site map

`/` home (hero wall → featured hang → brand story → Instagram feed → footer) ·
`/shop` and `/shop/[collection]` salon walls · `/product/[slug]` ·
`/about` · `/care` · `/shipping-returns` · `/contact` · bag drawer.

## 4. How each installed skill is used

| Phase | Skill | What it produces |
|---|---|---|
| Direction | `frontend-design:frontend-design` | ✅ Done: the concept, tokens and layout above |
| Architecture | `engineering:architecture` | ADR choosing the commerce backend (headless Shopify, Shopify Starter or a static catalogue) |
| Architecture | `engineering:system-design` | Data model for products and variants, plus the API layer |
| System | `design:design-system` | Token file, components (button, option picker, bag drawer, price, hung-piece) with documented states |
| Copy | `design:ux-copy` | Hero line, CTAs ("Add to bag" → "Added to bag"), empty bag, errors, care text |
| Preview | `artifact-design` + Artifact | A clickable moodboard and hero prototype the client can approve before full build |
| Motion assets | `remotion:remotion-create` / `remotion-markup` / `remotion-render` | (a) A reduced-motion and no-WebGL hero loop video; (b) 9:16 product reels in the same "painted wall" language for Instagram, so the site and the feed match |
| Build | `run` | Launch the dev server and take Playwright screenshots at 375, 768 and 1440px each milestone |
| Review | `design:design-critique` | Critique of each milestone screenshot (hierarchy and restraint) |
| Accessibility | `design:accessibility-review` | WCAG 2.1 AA audit: contrast, focus, keyboard path through the bag and checkout, reduced motion |
| Handoff | `design:design-handoff` | Spec for the shader uniforms, timings and breakpoints |
| Quality | `engineering:testing-strategy` | Playwright e2e tests (browse → add to bag → checkout handoff) plus visual regression |
| Quality | `code-review`, `simplify`, `security-review` | Per-PR review, especially of the checkout and contact form |
| Ops | `session-start-hook` | Cloud sessions install dependencies and can run lint and tests |
| Ops | `engineering:deploy-checklist` | Launch checklist (domain, analytics, OG images, 404s, redirects) |
| Docs | `engineering:documentation` | README and a guide for the client to update products |
| Extra | Canva connector | Pull an existing brand kit or create matching social templates |

## 5. Milestones

1. **Unblock content:** fill in the TO CONFIRM items and `products-template.csv`
   in `BRAND_BRIEF.md`, and get logo files and product photos.
2. **Prototype:** shader wall plus hero intro as a standalone page (Artifact
   preview for client sign-off).
3. **Scaffold:** Next.js app, tokens, fonts, layout shell, the shared canvas.
4. **Catalogue:** collection salon walls, product page, bag drawer (static data
   from the CSV).
5. **Ordering:** WhatsApp/DM order handoff (phase 1). Add a Shopify checkout only
   if the client wants one.
6. **Content pages:** story, care, shipping and returns, contact, Instagram feed.
7. **Polish:** Remotion fallback loop, accessibility audit, performance pass
   (LCP under 2.5s on 4G with the canvas loaded after first paint), e2e tests.
8. **Launch** with the deploy checklist.
