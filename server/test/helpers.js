// Builds a throwaway app (in-memory database, temporary media folder) for each test file.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { buildApp } from '../src/app.js';
import { hashPassword } from '../src/lib/crypto.js';
import { config } from '../src/config.js';

export const ORIGIN = config.publicOrigin;
export const OWNER = { email: 'owner@test.local', password: 'owner-password-123', name: 'Olive Owner' };
export const EDITOR = { email: 'editor@test.local', password: 'editor-password-123', name: 'Eddie Editor' };

export async function buildTestApp() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'okeanos-test-'));
  const app = await buildApp({ dataDir, databaseUrl: `file:${path.join(dataDir, 'test.db')}`, mediaDriver: 'local', logger: false });
  const { repos } = app;

  for (const user of [{ ...OWNER, role: 'owner' }, { ...EDITOR, role: 'editor' }]) {
    await repos.users.create({ email: user.email, name: user.name, role: user.role, passwordHash: await hashPassword(user.password) });
  }
  const earrings = await repos.categories.create({ name: 'Earrings', slug: 'earrings' });
  const hoopsId = await repos.pieces.create({
    name: 'Summer hoops', typeLabel: 'Earrings', categoryId: earrings, finish: 'gold', accent: 'beads', badge: 'New',
    isNew: true, description: 'Small beaded hoops.', priceCents: 4800, status: 'published', availability: 'made_to_order',
    optionLabel: 'Colour', instagramUrl: '', options: [{ label: 'White', swatch: '#F4EFE4' }, { label: 'Pastel', swatch: '' }],
    collectionIds: [],
  });
  const draftId = await repos.pieces.create({
    name: 'Secret draft', typeLabel: 'Ring', categoryId: earrings, finish: 'gold', accent: 'gold', badge: '', isNew: false,
    description: '', priceCents: null, status: 'draft', availability: 'made_to_order', optionLabel: '', instagramUrl: '',
    options: [], collectionIds: [],
  });

  app.addHook('onClose', async () => fs.rmSync(dataDir, { recursive: true, force: true }));
  return { app, ids: { earrings, hoopsId, draftId } };
}

// Logs in through the real form and returns what a browser would keep: the cookie and a CSRF token.
export async function login(app, { email, password } = OWNER) {
  const response = await app.inject({
    method: 'POST', url: '/admin/login', headers: { origin: ORIGIN },
    payload: { email, password, next: '/admin' },
  });
  const cookie = response.cookies.find((c) => c.name.endsWith('okeanos_session'));
  if (!cookie) throw new Error(`Login failed with status ${response.statusCode}`);
  const dashboard = await app.inject({ method: 'GET', url: '/admin', cookies: { [cookie.name]: cookie.value } });
  const csrf = dashboard.body.match(/name="_csrf" value="([^"]+)"/)[1];
  return { cookies: { [cookie.name]: cookie.value }, csrf };
}

// A POST from a logged-in admin, the way a browser form sends it.
export function adminPost(app, session, url, fields = {}) {
  return app.inject({
    method: 'POST', url, cookies: session.cookies, headers: { origin: ORIGIN },
    payload: { _csrf: session.csrf, ...fields },
  });
}

export function orderBody(overrides = {}) {
  return {
    idempotencyKey: `test-${Math.random().toString(36).slice(2)}-key`,
    website: '',
    customer: { name: 'Lara Haddad', phone: '+961 70 123 456', email: '', city: 'Beirut', address: 'Mar Mikhael, Armenia Street, building 4, floor 2', note: '' },
    location: { lat: 33.8959, lng: 35.5193, accuracy: 25 },
    items: [{ pieceId: 1, option: 'White', quantity: 2 }],
    ...overrides,
  };
}

export async function pngBuffer({ transparent = false } = {}) {
  return sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 200, g: 160, b: 90, alpha: transparent ? 0 : 1 } } })
    .png().toBuffer();
}

// Builds a multipart/form-data body by hand so tests need no extra dependency.
export function multipart(fields, files) {
  const boundary = `----okeanos${Math.random().toString(16).slice(2)}`;
  const chunks = [];
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
  }
  for (const file of files) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${file.field}"; filename="${file.filename}"\r\nContent-Type: ${file.type}\r\n\r\n`));
    chunks.push(file.buffer, Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
}
