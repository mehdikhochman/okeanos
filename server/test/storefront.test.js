import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { buildTestApp, login, adminPost } from './helpers.js';

let app;
before(async () => ({ app } = await buildTestApp()));
after(() => app.close());

test('the storefront script is inlined byte for byte', async () => {
  const script = fs.readFileSync(new URL('../src/storefront/storefront.js', import.meta.url), 'utf8');
  const html = (await app.inject({ url: '/' })).body;
  assert.ok(html.includes(script));
});

const catalogueOf = (html) => JSON.parse(html.match(/<script id="catalogue" type="application\/json">([\s\S]*?)<\/script>/)[1]);

test('the home page is served compressed with an ETag and a hash-based CSP', async () => {
  const response = await app.inject({ url: '/', headers: { 'accept-encoding': 'br, gzip' } });
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['content-encoding'], 'br');
  assert.match(response.headers.etag, /^"[a-f0-9]{20}"$/);
  assert.match(response.headers['content-security-policy'], /script-src 'sha256-[A-Za-z0-9+/=]+'/);
  assert.doesNotMatch(response.headers['content-security-policy'], /script-src[^;]*unsafe-inline/);
  assert.equal(response.headers['x-frame-options'], 'DENY');
  const html = zlib.brotliDecompressSync(response.rawPayload).toString();
  assert.match(html, /OKEANÓS/);
});

test('an unchanged page answers 304 with no body', async () => {
  const first = await app.inject({ url: '/' });
  const second = await app.inject({ url: '/', headers: { 'if-none-match': first.headers.etag } });
  assert.equal(second.statusCode, 304);
  assert.equal(second.body, '');
});

test('only published pieces reach the catalogue, with prices from the database', async () => {
  const catalogue = catalogueOf((await app.inject({ url: '/' })).body);
  assert.deepEqual(catalogue.pieces.map((p) => p.name), ['Summer hoops']);
  assert.equal(catalogue.pieces[0].price, 4800);
  assert.equal(catalogue.pieces[0].options[1].swatch, '', 'swatches that are not #rrggbb are dropped');
});

test('admin text cannot break out of the page (escaping)', async () => {
  const session = await login(app);
  await adminPost(app, session, '/admin/settings', {
    ...Object.fromEntries(Object.entries(app.repos.settings.getAll())),
    hero_line: '</script><script>alert(1)</script>',
    delivery_fee: '',
  });
  const html = (await app.inject({ url: '/' })).body;
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;/script&gt;&lt;script&gt;alert(1)&lt;/script&gt;'));
});

test('saving in the admin rebuilds the page', async () => {
  const before = (await app.inject({ url: '/' })).headers.etag;
  const session = await login(app);
  await adminPost(app, session, '/admin/settings/orders-open', { open: '0' });
  const response = await app.inject({ url: '/' });
  assert.notEqual(response.headers.etag, before);
  assert.equal(catalogueOf(response.body).settings.ordersOpen, false);
});

test('media paths outside the image pattern are refused', async () => {
  const response = await app.inject({ url: '/media/..%2f..%2fokeanos.db' });
  assert.equal(response.statusCode, 404);
});
