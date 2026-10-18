// Everything a shopper touches: the page, images, fonts and the order endpoint.
import path from 'node:path';
import { config } from '../config.js';
import { placeOrder, ORDER_BODY_SCHEMA } from './place-order.js';
import { serveFolderFromMemory, serveMediaFolder } from '../lib/static-files.js';

const PUBLIC_DIR = path.resolve(import.meta.dirname, '../../public');
const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

export async function publicRoutes(app) {
  app.get('/', async (request, reply) => {
    const page = await app.storefront.getPage();
    // On Vercel the CDN keeps the page for a few seconds at the edge, close to the visitor.
    if (config.isVercel) reply.header('cdn-cache-control', 'public, s-maxage=10, stale-while-revalidate=60');
    reply
      .header('content-type', 'text/html; charset=utf-8')
      .header('cache-control', 'no-cache') // always revalidate; unchanged pages answer 304 with no body
      .header('etag', page.etag)
      .header('vary', 'accept-encoding')
      .header('content-security-policy', page.csp);

    if (request.headers['if-none-match'] === page.etag) return reply.code(304).send();

    const accepted = request.headers['accept-encoding'] ?? '';
    if (/\bbr\b/.test(accepted)) return reply.header('content-encoding', 'br').send(page.br);
    if (/\bgzip\b/.test(accepted)) return reply.header('content-encoding', 'gzip').send(page.gzip);
    return reply.send(page.html);
  });

  // Uploaded images: content-hashed names, so they can be cached for a year.
  // (On Vercel they are served by Vercel Blob instead, and there is no local folder.)
  const forever = `public, max-age=${ONE_YEAR_SECONDS}, s-maxage=${ONE_YEAR_SECONDS}, immutable`;
  if (app.media.dir) serveMediaFolder(app, { prefix: '/media/', root: app.media.dir, cacheControl: forever });

  // Fonts keep their names forever; the icon and error styles may change, so they are cached for a day.
  serveFolderFromMemory(app, {
    prefix: '/assets/',
    root: PUBLIC_DIR,
    cacheControl: (name) => (name.endsWith('.woff2') ? forever : 'public, max-age=86400, s-maxage=86400'),
  });

  app.get('/robots.txt', async (request, reply) => reply.type('text/plain').send('User-agent: *\nDisallow: /admin\nDisallow: /api\n'));

  app.get('/health', async () => ({ ok: true }));

  app.post('/api/orders', {
    schema: { body: ORDER_BODY_SCHEMA },
    config: { rateLimit: { max: 5, timeWindow: '10 minutes' } },
  }, async (request, reply) => {
    const result = await placeOrder(app.repos, request.body, request.ip);
    if (result.created) app.log.info({ order: result.number }, 'Order placed');
    return reply.code(result.created ? 201 : 200).send({ number: result.number });
  });
}
