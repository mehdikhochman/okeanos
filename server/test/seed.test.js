// The starter catalogue: everything from the prototype loads, and it never runs twice.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildApp } from '../src/app.js';
import { seedCatalogue } from '../scripts/seed.js';
import { migrateDatabase, openDatabase } from '../src/db/database.js';

let app;
let dataDir;
before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'okeanos-seed-'));
  app = await buildApp({ dataDir, databaseUrl: `file:${path.join(dataDir, 'seed.db')}`, mediaDriver: 'local', logger: false });
});
after(async () => {
  await app.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const quiet = () => {};

test('loads the 11 pieces with their photos, the lookbook and the guide', async () => {
  assert.equal(await seedCatalogue({ repos: app.repos, media: app.media, log: quiet }), true);
  const pieces = await app.repos.pieces.listPublished();
  assert.equal(pieces.length, 11);
  assert.ok(pieces.every((piece) => piece.images.length > 0), 'every piece has photos');
  assert.equal(pieces.filter((piece) => piece.images.some((image) => image.role === 'cutout')).length, 7);
  assert.equal((await app.repos.lookbook.list()).length, 7);
  assert.equal((await app.repos.guide.list()).length, 4);
  const page = (await app.inject({ url: '/' })).body;
  assert.match(page, /"name":"Summer hoops"/);
});

// The shop's style: no commas anywhere a visitor reads (prices use a thin space instead).
test('the shop page shows no commas', async () => {
  const page = (await app.inject({ url: '/' })).body;
  const visibleText = page.replace(/<head>[\s\S]*?<\/head>|<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ');
  assert.equal(visibleText.match(/.{0,40},.{0,40}/)?.[0], undefined);
  for (const [, attribute] of page.matchAll(/(?:alt|placeholder|aria-label|title)="([^"]*)"/g)) assert.doesNotMatch(attribute, /,/);
  const { pieces, lookbook } = JSON.parse(page.match(/<script id="catalogue" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  for (const text of [...pieces.flatMap((p) => [p.name, p.type, p.desc]), ...lookbook.map((photo) => photo.caption)]) assert.doesNotMatch(text, /,/);
  assert.doesNotMatch(page.match(/<title>(.*)<\/title>/)[1], /,/);
});

test('runs only once, so pieces the shop deletes do not come back', async () => {
  const [first] = await app.repos.pieces.list();
  await app.repos.pieces.remove(first.id);
  assert.equal(await seedCatalogue({ repos: app.repos, media: app.media, log: quiet }), false);
  assert.equal((await app.repos.pieces.listPublished()).length, 10);
});

test('texts loaded before the no-comma style are rewritten, edited ones are kept', async () => {
  const url = `file:${path.join(dataDir, 'old.db')}`;
  await migrateDatabase({ url });
  const db = await openDatabase({ url, migrate: false });
  await db.batch([
    { sql: "DELETE FROM schema_migrations WHERE name = '003_texts_without_commas.sql'", args: [] },
    { sql: "INSERT INTO categories (slug, name) VALUES ('rings', 'Rings')", args: [] },
    { sql: `INSERT INTO pieces (slug, name, type_label, category_id, description, status)
            VALUES ('organic-ring-wrap', 'Organic ring, wrap', 'Ring', 1, 'Puffy, high-shine teardrop hoops on post backs.', 'published')`, args: [] },
    { sql: "INSERT INTO settings (key, value) VALUES ('about_3_text', 'Order on the site, and we bring your pieces to your door.')", args: [] },
    { sql: "INSERT INTO settings (key, value) VALUES ('shop_intro', 'Our own words, kept as typed.')", args: [] },
  ]);
  await migrateDatabase({ url });
  assert.deepEqual(await db.get('SELECT slug, name, description FROM pieces'),
    { slug: 'organic-wrap-ring', name: 'Organic wrap ring', description: 'Puffy high-shine teardrop hoops on post backs.' });
  assert.equal(await db.value("SELECT value FROM settings WHERE key = 'about_3_text'"), 'Order on the site and we bring your pieces to your door.');
  assert.equal(await db.value("SELECT value FROM settings WHERE key = 'shop_intro'"), 'Our own words, kept as typed.');
  db.close();
});
