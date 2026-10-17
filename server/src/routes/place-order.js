// Turns a checkout submission into an order.
//
// The browser's prices are never trusted: names and prices are read from the database.
// The idempotency key makes a double click or a retried request place one order, not two.
import { config } from '../config.js';
import { hmac } from '../lib/crypto.js';
import { HttpError, badRequest } from '../lib/http-error.js';

const MAX_ORDERS_PER_IP_PER_DAY = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

const text = (minLength, maxLength) => ({ type: 'string', minLength, maxLength });

export const ORDER_BODY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['idempotencyKey', 'customer', 'items'],
  properties: {
    idempotencyKey: { type: 'string', pattern: '^[A-Za-z0-9_-]{16,64}$' },
    website: { type: 'string', maxLength: 200 }, // hidden honeypot field: people leave it empty, bots fill it
    customer: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'phone', 'city', 'address'],
      properties: {
        name: text(2, 80),
        phone: { type: 'string', pattern: '^\\+?[0-9 ()\\-]{7,20}$' },
        email: { type: 'string', maxLength: 120, pattern: '^$|^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$' },
        city: text(2, 60),
        address: text(5, 300),
        note: text(0, 500),
      },
    },
    location: {
      type: ['object', 'null'],
      additionalProperties: false,
      required: ['lat', 'lng'],
      properties: {
        lat: { type: 'number', minimum: -90, maximum: 90 },
        lng: { type: 'number', minimum: -180, maximum: 180 },
        accuracy: { type: 'number', minimum: 0, maximum: 100000 },
      },
    },
    items: {
      type: 'array',
      minItems: 1,
      maxItems: 30,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['pieceId', 'quantity'],
        properties: {
          pieceId: { type: 'integer', minimum: 1 },
          option: { type: 'string', maxLength: 40 },
          quantity: { type: 'integer', minimum: 1, maximum: 20 },
        },
      },
    },
  },
};

export function placeOrder(repos, body, ip) {
  const settings = repos.settings.getAll();
  if (settings.orders_open !== '1') throw new HttpError(403, settings.orders_closed_message);
  if (body.website) throw badRequest('The order could not be placed.');

  const existing = repos.orders.findByIdempotencyKey(body.idempotencyKey);
  if (existing) return { created: false, number: existing.number };

  const ipHash = hmac(config.ipHashSecret, ip ?? '');
  const since = new Date(Date.now() - DAY_MS).toISOString();
  if (repos.orders.countRecentFromIp(ipHash, since) >= MAX_ORDERS_PER_IP_PER_DAY) {
    throw new HttpError(429, 'Too many orders from this connection today. Please contact us on WhatsApp.');
  }

  const items = body.items.map((item) => resolveItem(repos, item));
  const order = buildOrder(body, items, settings, ipHash);
  const { number } = repos.orders.create(order, items);
  return { created: true, number };
}

function resolveItem(repos, item) {
  const piece = repos.pieces.getForOrder(item.pieceId);
  if (!piece) throw badRequest('One of the pieces in your bag is no longer available. Remove it and try again.');
  if (piece.availability === 'sold_out') throw badRequest(`${piece.name} is sold out. Remove it from your bag and try again.`);

  const options = repos.pieces.optionLabels(piece.id);
  const optionLabel = item.option ?? '';
  if (options.length && !options.includes(optionLabel)) throw badRequest(`Choose an option for ${piece.name}.`);
  if (!options.length && optionLabel) throw badRequest(`${piece.name} has no options.`);

  return { pieceId: piece.id, pieceName: piece.name, optionLabel, quantity: item.quantity, unitPriceCents: piece.price_cents };
}

function buildOrder(body, items, settings, ipHash) {
  const allPriced = items.every((item) => item.unitPriceCents !== null);
  const subtotalCents = allPriced ? items.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0) : null;
  const deliveryCents = settings.delivery_fee === '' ? null : Number(settings.delivery_fee);
  const { customer, location } = body;

  return {
    idempotencyKey: body.idempotencyKey,
    customerName: customer.name.trim(),
    phone: customer.phone.trim(),
    email: (customer.email ?? '').trim(),
    city: customer.city.trim(),
    address: customer.address.trim(),
    customerNote: (customer.note ?? '').trim(),
    latitude: location?.lat ?? null,
    longitude: location?.lng ?? null,
    locationAccuracy: location?.accuracy == null ? null : Math.round(location.accuracy),
    currency: settings.currency,
    subtotalCents,
    deliveryCents,
    totalCents: subtotalCents !== null && deliveryCents !== null ? subtotalCents + deliveryCents : null,
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    ipHash,
  };
}
