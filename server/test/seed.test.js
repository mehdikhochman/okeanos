// The starter catalogue: everything from the prototype loads, and it never runs twice.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildApp } from '../src/app.js';
import { seedCatalogue } from '../scripts/seed.js';

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

test('runs only once, so pieces the shop deletes do not come back', async () => {
  const [first] = await app.repos.pieces.list();
  await app.repos.pieces.remove(first.id);
  assert.equal(await seedCatalogue({ repos: app.repos, media: app.media, log: quiet }), false);
  assert.equal((await app.repos.pieces.listPublished()).length, 10);
});
