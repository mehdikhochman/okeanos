// Builds the storefront page from the database.
//
// The page is rendered once, compressed once (Brotli + gzip) and kept in memory.
// Any admin change calls invalidate(); the next visitor triggers one rebuild (a few ms).
// Visitors therefore get a ready-made buffer: no database query, no templating per request.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { config } from '../config.js';
import { escapeHtml, html, jsonForScript } from '../lib/html.js';
import { sha256, sha256Base64 } from '../lib/crypto.js';
import { mediaUrl } from '../lib/media.js';
import { IMG_SOURCES } from '../plugins/security-headers.js';

const TEMPLATE = fs.readFileSync(new URL('./template.html', import.meta.url), 'utf8');
const SCRIPT = fs.readFileSync(new URL('./storefront.js', import.meta.url), 'utf8');
const MATERIALS = {
  gold: '18k gold-plated stainless steel',
  rose: 'Rose gold-plated stainless steel',
  silver: 'Polished stainless steel',
  mixed: 'Gold-plated and polished stainless steel',
};
const HEX_COLOUR = /^#[0-9a-f]{6}$/i;

// Several server instances may run at once (Vercel starts more under load). Each keeps its own
// copy of the page and compares it with catalogue_version, which every admin change increases.
export function createStorefront({ repos }) {
  let page = null;
  let building = null;
  return {
    async getPage() {
      const version = await repos.settings.catalogueVersion();
      if (page?.version === version) return page;
      building ??= buildPage(repos, version).finally(() => { building = null; });
      page = await building;
      return page;
    },
    async invalidate() {
      page = null;
      await repos.settings.bumpCatalogueVersion();
    },
  };
}

async function buildPage(repos, version) {
  const settings = await repos.settings.getAll();
  const catalogue = await buildCatalogue(repos, settings);
  const guideEntries = await repos.guide.listVisible();
  // A replacer function, because a replacement string would treat "$$" and "$'" in the script as patterns.
  const withScript = TEMPLATE.replace('/*STOREFRONT_SCRIPT*/', () => SCRIPT);
  const document = fillTemplate(withScript, pageValues(settings, catalogue, guideEntries));
  const buffer = Buffer.from(document);

  return {
    version,
    html: buffer,
    br: zlib.brotliCompressSync(buffer, {
      params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 10, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buffer.length },
    }),
    gzip: zlib.gzipSync(buffer, { level: 9 }),
    etag: `"${sha256(document).slice(0, 20)}"`,
    csp: contentSecurityPolicy(document),
  };
}

// The inline script is allowed by its exact hash, so injected scripts can never run.
function contentSecurityPolicy(document) {
  const hashes = [...document.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => `'sha256-${sha256Base64(match[1])}'`);
  return [
    "default-src 'self'",
    `script-src ${hashes.join(' ')}`,
    // Inline style attributes are used for per-piece colours and light positions. Styles cannot run code.
    "style-src 'self' 'unsafe-inline'",
    IMG_SOURCES,
    "font-src 'self'",
    "connect-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "object-src 'none'",
  ].join('; ');
}

// {{name}} inserts an escaped value; {{{name}}} inserts HTML we built ourselves.
function fillTemplate(template, values) {
  return template.replace(/\{\{(\{?)(\w+)\}?\}\}/g, (match, isRaw, key) => {
    if (!(key in values)) throw new Error(`Storefront template uses unknown value "${key}"`);
    return isRaw ? String(values[key]) : escapeHtml(values[key]);
  });
}

function imageFor(row) {
  return { s: mediaUrl(row, 480), l: mediaUrl(row, 1200), w: row.width, h: row.height };
}

function toPublicPiece(piece) {
  const cutout = piece.images.find((image) => image.role === 'cutout');
  return {
    id: piece.id,
    name: piece.name,
    type: piece.type_label,
    cat: piece.category_slug,
    finish: piece.finish,
    accent: piece.accent,
    badge: piece.badge,
    isNew: Boolean(piece.is_new),
    desc: piece.description,
    price: piece.price_cents,
    soldOut: piece.availability === 'sold_out',
    optionLabel: piece.option_label,
    options: piece.options.map((option) => ({ label: option.label, swatch: HEX_COLOUR.test(option.swatch) ? option.swatch : '' })),
    cut: cutout ? imageFor(cutout) : null,
    photos: piece.images.filter((image) => image.role === 'photo').map(imageFor),
    collections: piece.collectionSlugs,
    instagram: piece.instagram_url,
    material: MATERIALS[piece.finish],
    added: piece.created_at,
  };
}

async function buildCatalogue(repos, settings) {
  const [published, categories, collections, lookbook] = await Promise.all([
    repos.pieces.listPublished(), repos.categories.list(), repos.collections.list(), repos.lookbook.listVisible(),
  ]);
  const pieces = published.map(toPublicPiece);
  const usedCategories = new Set(pieces.map((piece) => piece.cat));
  const usedCollections = new Set(pieces.flatMap((piece) => piece.collections));

  return {
    pieces,
    categories: categories.filter((c) => usedCategories.has(c.slug)).map(({ slug, name }) => ({ slug, name })),
    collections: collections.filter((c) => c.is_visible && usedCollections.has(c.slug)).map(({ slug, name }) => ({ slug, name })),
    lookbook: lookbook.map((photo) => ({ ...imageFor(photo), caption: photo.caption })),
    settings: {
      currency: settings.currency,
      deliveryCents: settings.delivery_fee === '' ? null : Number(settings.delivery_fee),
      ordersOpen: settings.orders_open === '1',
      whatsapp: settings.whatsapp_number,
    },
  };
}

function pageValues(settings, catalogue, guideEntries) {
  const ogPhoto = catalogue.lookbook[0] ?? catalogue.pieces.find((piece) => piece.photos[0])?.photos[0];
  return {
    ...settings,
    public_origin: config.publicOrigin,
    brand_wordmark: settings.wordmark,
    og_image: ogPhoto ? html`<meta property="og:image" content="${config.publicOrigin}${ogPhoto.l}">` : '',
    announcement_bar: settings.announcement
      ? html`<div class="announce"><div class="wrap"><span>${settings.announcement}</span></div></div>` : '',
    nav_category_links: catalogue.categories.map((c) => html`<a href="#shop" data-cat="${c.slug}">${c.name}</a>`),
    footer_category_links: catalogue.categories.map((c) =>
      html`<li><button class="link" type="button" data-cat="${c.slug}">${c.name}</button></li>`),
    about_blocks: [1, 2, 3]
      .filter((n) => settings[`about_${n}_title`])
      .map((n) => html`<div><h3>${settings[`about_${n}_title`]}</h3><p>${settings[`about_${n}_text`]}</p></div>`),
    guide_section: guideSection(guideEntries),
    contact_links: contactLinks(settings),
    city_options: settings.cities.split('\n').map((city) => city.trim()).filter(Boolean).map((city) => html`<option value="${city}">`),
    done_contact_link: settings.whatsapp_number
      ? html`<a class="cta" id="doneWhatsApp" href="https://wa.me/${settings.whatsapp_number}" target="_blank" rel="noopener">Message us on WhatsApp</a>` : '',
    catalogue_json: jsonForScript(catalogue),
  };
}

function guideSection(entries) {
  if (!entries.length) return '';
  const paragraphs = (text) => text.split(/\n+/).map((line) => line.trim()).filter(Boolean).map((line) => html`<p>${line}</p>`);
  return html`
    <section class="sec" id="guide" aria-labelledby="guide-h">
      <div class="wrap">
        <div class="sec-head"><h2 id="guide-h">Guide</h2><p>Care, sizing and returns.</p></div>
        <div class="guide">${entries.map((entry, index) => html`
          <details class="acc" ${index === 0 ? 'open' : ''}>
            <summary>${entry.question} <svg class="i"><use href="#i-down"/></svg></summary>
            <div class="acc-body">${paragraphs(entry.answer)}</div>
          </details>`)}
        </div>
      </div>
    </section>`;
}

function contactLinks(settings) {
  const links = [];
  if (settings.whatsapp_number) links.push(html`<li><a href="https://wa.me/${settings.whatsapp_number}" target="_blank" rel="noopener">WhatsApp</a></li>`);
  if (settings.instagram_handle) {
    links.push(html`<li><a href="https://www.instagram.com/${settings.instagram_handle}/" target="_blank" rel="noopener">@${settings.instagram_handle} on Instagram</a></li>`);
  }
  if (settings.contact_email) links.push(html`<li><a href="mailto:${settings.contact_email}">${settings.contact_email}</a></li>`);
  links.push(html`<li>Beirut, Lebanon</li>`);
  return links;
}
