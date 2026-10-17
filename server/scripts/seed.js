// Fills an empty database with the pieces found on @okeanosjewels, their photos,
// the lookbook and the Guide highlight. Run once: `npm run seed`.
// Prices are left empty ("Price on request") until the shop sets them in the admin.
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../src/config.js';
import { openDatabase } from '../src/db/database.js';
import { createRepositories } from '../src/repositories/index.js';
import { createMediaStore } from '../src/lib/media.js';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');
const CUTOUTS = path.join(REPO_ROOT, 'prototype/img');
const PHOTOS = path.join(REPO_ROOT, 'assets/instagram');

const CATEGORIES = ['Earrings', 'Rings', 'Bangles', 'Hand chains', 'Necklaces'];

const PIECES = [
  { name: 'Hand chain', type: 'Wrist to finger', category: 'Hand chains', badge: 'Best seller',
    description: 'A fine chain from wrist to finger with a small heart on the back of the hand.',
    photos: ['DMflnuQMd3h_3', 'DMflnuQMd3h_1', 'DMYERJ6MmlI_5'], post: 'DMflnuQMd3h' },
  { name: 'Summer hoops', type: 'Earrings', category: 'Earrings', accent: 'beads',
    description: 'Small hoops packed with irregular beads. Wear one colour, or split a pair with a friend.',
    photos: ['DMSkuxiMeaq_1', 'DMSkuxiMeaq_3', 'DMSkuxiMeaq_2'], post: 'DMSkuxiMeaq',
    optionLabel: 'Colour', options: [{ label: 'White', swatch: '#F4EFE4' }, { label: 'Pastel', swatch: '#E9B8C8' }] },
  { name: 'Loop Bangle', type: 'Bangle', category: 'Bangles', badge: 'New', isNew: true,
    description: 'An open cuff of linked oval loops with ridged ends. Stacks with a smooth bangle.',
    cutout: 'loop-bangle', photos: ['DMnLYtns6xk_2', 'DMnLeyDsuVS_1', 'DMnLYtns6xk_1'], post: 'DMnLeyDsuVS' },
  { name: 'Cluster earrings', type: 'Earrings', category: 'Earrings',
    description: 'Puffy, high-shine teardrop hoops on post backs.',
    cutout: 'cluster-earrings', photos: ['DMflv7RM8FC_1'], post: 'DMflv7RM8FC' },
  { name: 'Flowers earrings', type: 'Earrings', category: 'Earrings', accent: 'enamel',
    description: 'Five-petal studs in mint enamel, edged and centred in gold.',
    cutout: 'flowers-earrings', photos: ['DMSk5HlsS_K_2', 'DMSk5HlsS_K_1'], post: 'DMSk5HlsS_K' },
  { name: 'Leaf studs', type: 'Earrings', category: 'Earrings', badge: 'New in', isNew: true,
    description: 'Large sculpted leaf studs in polished gold. Working name, to be confirmed.',
    cutout: 'leaf-studs', photos: ['DMs6LVlMzue_2', 'DMs6LVlMzue_1'], post: 'DMs6LVlMzue' },
  { name: 'Era earrings', type: 'Earrings', category: 'Earrings',
    description: 'Chunky wavy hoops with a hinged closure.',
    cutout: 'era-earrings', photos: ['DMVYxotMCLq_1'], post: 'DMVYxotMCLq' },
  { name: 'Organic ring, wrap', type: 'Ring', category: 'Rings',
    description: 'An open wrap ring with one end pressed flat. Adjustable.',
    cutout: 'organic-wrap-ring', photos: ['DMYZPxmMPJS_1'], post: 'DMYZPxmMPJS' },
  { name: 'Organic ring, double band', type: 'Ring', category: 'Rings',
    description: 'Two rounded bands that pass each other. Adjustable.',
    cutout: 'organic-double-ring', photos: ['DMYZPxmMPJS_3', 'DMYZPxmMPJS_2'], post: 'DMYZPxmMPJS' },
  { name: 'Rose gold rings', type: 'Rings', category: 'Rings', finish: 'rose', badge: 'New', isNew: true,
    description: 'Thin stacking rings, including a zigzag band and a dotted band.',
    photos: ['DMVYoCYsFC8_2', 'DMVYoCYsFC8_3', 'DMVYoCYsFC8_1'], post: 'DMVYoCYsFC8',
    optionLabel: 'Style', options: [{ label: 'Zigzag', swatch: '' }, { label: 'Dotted', swatch: '' }] },
  { name: 'Satellite necklace', type: 'Necklace', category: 'Necklaces',
    description: 'A fine chain set with small beads at even intervals. Working name, to be confirmed.',
    photos: ['DMflnuQMd3h_4', 'DMflnuQMd3h_2'], post: 'DMflnuQMd3h' },
];

const LOOKBOOK = [
  ['DMsDbsas31f_1', 'Hand chain, dome ring and bangles'],
  ['DMnLYtns6xk_4', 'Loop Bangle, stacked'],
  ['DMYERJ6MmlI_2', 'Summer hoops in pastel'],
  ['DMSkuxiMeaq_4', 'Summer hoops, split between friends'],
  ['DMflnuQMd3h_2', 'Hand chain and satellite necklace'],
  ['DMVYoCYsFC8_4', 'Rose gold rings'],
  ['DMsDbsas31f_4', 'Small hoops and dome ring'],
];

// From the "Guide" story highlight on Instagram.
const GUIDE = [
  ['How do I make my jewellery last longer?',
    "Don't wear your pieces day and night. Constant wear shortens their life.\nPut on perfume and lotion before your jewellery, not after.\nTake your jewellery off before showering, swimming, sport and sleep. That way it stays as it was the day you received it."],
  ['Can I return or exchange a piece?',
    "No. Every piece is made when you order it, so orders can't be returned or exchanged.\nIf a piece doesn't fit, give it back to us and we will fix the size for free."],
  ['Who makes the pieces?', 'Ōkeanós designs and makes every piece. All pieces are stainless steel plated in gold.'],
  ['How do I pay?', 'You pay in cash when your order is delivered.'],
];

async function main() {
  const db = openDatabase(path.join(config.dataDir, 'okeanos.db'));
  const repos = createRepositories(db);
  const media = createMediaStore(path.join(config.dataDir, 'media'));

  if (repos.pieces.countByStatus().published + repos.pieces.countByStatus().draft > 0) {
    console.log('The database already has pieces. Nothing was changed.');
    return;
  }

  async function image(file) {
    const saved = await media.save(fs.readFileSync(file));
    return repos.images.save(saved);
  }

  const categoryIds = Object.fromEntries(CATEGORIES.map((name) => [name, repos.categories.create({ name, slug: name.toLowerCase().replace(/\s+/g, '-') })]));
  const summer = repos.collections.create({ name: 'Summer 2025', slug: 'summer-2025', description: 'The July 2025 drop.', isVisible: true });

  for (const piece of PIECES) {
    const id = repos.pieces.create({
      name: piece.name, typeLabel: piece.type, categoryId: categoryIds[piece.category], finish: piece.finish ?? 'gold',
      accent: piece.accent ?? 'gold', badge: piece.badge ?? '', isNew: piece.isNew ?? false, description: piece.description,
      priceCents: null, status: 'published', availability: 'made_to_order', optionLabel: piece.optionLabel ?? '',
      instagramUrl: `https://www.instagram.com/p/${piece.post}/`, options: piece.options ?? [], collectionIds: [summer],
    });
    if (piece.cutout) repos.pieces.addImage(id, (await image(path.join(CUTOUTS, `${piece.cutout}.webp`))).id, 'cutout', piece.name);
    for (const photo of piece.photos) repos.pieces.addImage(id, (await image(path.join(PHOTOS, `${photo}.jpg`))).id, 'photo', piece.name);
    console.log(`Added ${piece.name}`);
  }

  for (const [photo, caption] of LOOKBOOK) repos.lookbook.create((await image(path.join(PHOTOS, `${photo}.jpg`))).id, caption);
  for (const [question, answer] of GUIDE) repos.guide.create({ question, answer, isVisible: true });

  repos.activity.log(null, 'seed', 'loaded the starting catalogue from Instagram');
  console.log(`Done: ${PIECES.length} pieces, ${LOOKBOOK.length} lookbook photos, ${GUIDE.length} guide entries.`);
  db.close();
}

await main();
