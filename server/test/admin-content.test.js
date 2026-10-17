import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildTestApp, login, adminPost, multipart, pngBuffer, ORIGIN, orderBody } from './helpers.js';

let app;
let ids;
let session;
before(async () => {
  ({ app, ids } = await buildTestApp());
  session = await login(app);
});
after(() => app.close());

const page = (url) => app.inject({ url, cookies: session.cookies });

test('every admin page renders', async () => {
  for (const url of ['/admin', '/admin/orders', '/admin/pieces', '/admin/pieces/new', `/admin/pieces/${ids.hoopsId}`,
    '/admin/categories', '/admin/collections', '/admin/lookbook', '/admin/guide', '/admin/settings', '/admin/users',
    '/admin/account', '/admin/activity', '/admin/backup']) {
    const response = await page(url);
    assert.equal(response.statusCode, 200, url);
  }
});

test('a piece can be created, shown again with errors, and published', async () => {
  const invalid = await adminPost(app, session, '/admin/pieces', { name: '', type_label: 'Ring', category_id: ids.earrings, status: 'published', availability: 'made_to_order', finish: 'gold', accent: 'gold', price: 'cheap' });
  assert.equal(invalid.statusCode, 400);
  assert.match(invalid.body, /Name is required/);
  assert.match(invalid.body, /Price must be a number/);

  const created = await adminPost(app, session, '/admin/pieces', {
    name: 'Era earrings', type_label: 'Earrings', category_id: ids.earrings, status: 'published',
    availability: 'made_to_order', finish: 'gold', accent: 'gold', price: '55.50', options: '',
  });
  assert.equal(created.statusCode, 303);
  const storefront = (await app.inject({ url: '/' })).body;
  assert.match(storefront, /"name":"Era earrings"/);
  assert.match(storefront, /"price":5550/);
});

test('option colours must be real colours', async () => {
  const response = await adminPost(app, session, `/admin/pieces/${ids.hoopsId}`, {
    name: 'Summer hoops', type_label: 'Earrings', category_id: ids.earrings, status: 'published', availability: 'made_to_order',
    finish: 'gold', accent: 'beads', option_label: 'Colour', options: 'White, red;background:url(x)',
  });
  assert.equal(response.statusCode, 400);
  assert.match(response.body, /is not a colour/);
});

test('photos are uploaded, re-encoded to WebP, and transparent ones become cut-outs', async () => {
  const body = multipart({ _csrf: session.csrf }, [
    { field: 'photos', filename: 'cutout.png', type: 'image/png', buffer: await pngBuffer({ transparent: true }) },
    { field: 'photos', filename: 'photo.png', type: 'image/png', buffer: await pngBuffer() },
  ]);
  const response = await app.inject({
    method: 'POST', url: `/admin/pieces/${ids.hoopsId}/images`, cookies: session.cookies,
    headers: { origin: ORIGIN, 'content-type': body.contentType }, payload: body.payload,
  });
  assert.equal(response.statusCode, 303);
  const images = app.repos.pieces.get(ids.hoopsId).images;
  assert.deepEqual(images.map((i) => i.role).sort(), ['cutout', 'photo']);
  const media = await app.inject({ url: `/media/${images[0].file_key}-480.webp` });
  assert.equal(media.statusCode, 200);
  assert.match(media.headers['cache-control'], /immutable/);
});

test('a file that is not an image is refused', async () => {
  const body = multipart({ _csrf: session.csrf }, [
    { field: 'photos', filename: 'evil.png', type: 'image/png', buffer: Buffer.from('<?php system($_GET["c"]); ?>') },
  ]);
  const response = await app.inject({
    method: 'POST', url: `/admin/pieces/${ids.hoopsId}/images`, cookies: session.cookies,
    headers: { origin: ORIGIN, 'content-type': body.contentType }, payload: body.payload,
  });
  assert.equal(response.statusCode, 400);
});

test('orders can be processed and exported, with formula injection neutralised', async () => {
  const order = orderBody({ items: [{ pieceId: ids.hoopsId, option: 'White', quantity: 1 }] });
  order.customer.name = '=HYPERLINK("http://evil")';
  await app.inject({ method: 'POST', url: '/api/orders', payload: order, remoteAddress: '10.1.1.1' });
  const orderId = app.repos.orders.list()[0].id;

  const detail = await page(`/admin/orders/${orderId}`);
  assert.match(detail.body, /wa\.me\/96170123456/);
  assert.match(detail.body, /google\.com\/maps/);

  await adminPost(app, session, `/admin/orders/${orderId}/status`, { status: 'confirmed' });
  assert.equal(app.repos.orders.get(orderId).status, 'confirmed');

  const csv = await page('/admin/orders.csv');
  assert.match(csv.headers['content-type'], /text\/csv/);
  assert.match(csv.body, /"'=HYPERLINK/);
});

test('team members get a one-time password and the last owner cannot be removed', async () => {
  const created = await adminPost(app, session, '/admin/users', { name: 'New Person', email: 'new@test.local', role: 'editor' });
  assert.equal(created.statusCode, 200);
  assert.match(created.body, /shown only once/);

  const ownerId = app.repos.users.findByEmail('owner@test.local').id;
  const editorId = app.repos.users.findByEmail('editor@test.local').id;
  await adminPost(app, session, `/admin/users/${editorId}/role`, { role: 'owner' });
  await adminPost(app, session, `/admin/users/${editorId}/role`, { role: 'editor' });
  const selfDelete = await adminPost(app, session, `/admin/users/${ownerId}/delete`);
  assert.equal(selfDelete.statusCode, 400);
});

test('every change is written to the activity log', async () => {
  const entries = app.repos.activity.list({ limit: 100 }).map((e) => e.action);
  for (const action of ['piece.create', 'piece.photos', 'order.status', 'user.create']) assert.ok(entries.includes(action), action);
});

test('the database backup downloads', async () => {
  const response = await adminPost(app, session, '/admin/backup/database');
  assert.equal(response.statusCode, 200);
  assert.equal(response.rawPayload.subarray(0, 15).toString(), 'SQLite format 3');
});
