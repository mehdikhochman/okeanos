import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildTestApp, orderBody } from './helpers.js';

let app;
let ids;
before(async () => ({ app, ids } = await buildTestApp()));
after(() => app.close());

const place = (body, ip = '10.0.0.1') => app.inject({ method: 'POST', url: '/api/orders', payload: body, remoteAddress: ip });

test('a valid order is saved with prices from the database, not from the browser', async () => {
  const response = await place(orderBody({ items: [{ pieceId: ids.hoopsId, option: 'Pastel', quantity: 2 }] }));
  assert.equal(response.statusCode, 201);
  assert.match(response.json().number, /^OK-\d{4}$/);

  const order = await app.repos.orders.get(1);
  assert.equal(order.customer_name, 'Lara Haddad');
  assert.equal(order.city, 'Beirut');
  assert.equal(order.latitude, 33.8959);
  assert.equal(order.subtotal_cents, 9600);
  assert.equal(order.items[0].option_label, 'Pastel');
  assert.equal(order.ip_hash.length, 64, 'the IP is stored only as a keyed hash');
});

test('a double click places one order', async () => {
  const body = orderBody({ items: [{ pieceId: ids.hoopsId, option: 'White', quantity: 1 }] });
  const first = await place(body, '10.0.0.2');
  const second = await place(body, '10.0.0.2');
  assert.equal(first.statusCode, 201);
  assert.equal(second.statusCode, 200);
  assert.equal(first.json().number, second.json().number);
});

test('draft pieces, unknown options and silly quantities are rejected', async () => {
  const cases = [
    { items: [{ pieceId: ids.draftId, quantity: 1 }] },
    { items: [{ pieceId: ids.hoopsId, option: 'Purple', quantity: 1 }] },
    { items: [{ pieceId: ids.hoopsId, option: 'White', quantity: 500 }] },
    { items: [] },
  ];
  for (const overrides of cases) {
    const response = await place(orderBody(overrides), '10.0.0.3');
    assert.equal(response.statusCode, 400, JSON.stringify(overrides));
    assert.ok(response.json().error);
  }
});

test('unknown fields and bad phone numbers are rejected, not silently fixed', async () => {
  const extra = await place({ ...orderBody(), isAdmin: true }, '10.0.0.4');
  assert.equal(extra.statusCode, 400);
  const badPhone = orderBody();
  badPhone.customer.phone = 'call me';
  assert.equal((await place(badPhone, '10.0.0.4')).statusCode, 400);
});

test('the hidden honeypot field stops bots', async () => {
  const response = await place(orderBody({ website: 'http://spam.example' }), '10.0.0.5');
  assert.equal(response.statusCode, 400);
});

test('orders are rate limited per connection', async () => {
  let last;
  for (let i = 0; i < 7; i += 1) last = await place(orderBody({ items: [{ pieceId: ids.hoopsId, option: 'White', quantity: 1 }] }), '10.0.0.9');
  assert.equal(last.statusCode, 429);
});

test('no orders are taken while the shop is paused', async () => {
  await app.repos.settings.setMany({ orders_open: '0' });
  const response = await place(orderBody({ items: [{ pieceId: ids.hoopsId, option: 'White', quantity: 1 }] }), '10.0.0.6');
  assert.equal(response.statusCode, 403);
  await app.repos.settings.setMany({ orders_open: '1' });
});
