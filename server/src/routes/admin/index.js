// The admin area. Body parsers are registered here, *after* the auth hook runs on
// onRequest, so anonymous visitors can never make the server parse an upload.
import fastifyFormbody from '@fastify/formbody';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'node:url';
import { registerAuth } from '../../plugins/auth.js';
import { SPECULATION_RULES } from '../../admin-ui/layout.js';
import { authRoutes } from './auth.js';
import { dashboardRoutes } from './dashboard.js';
import { orderRoutes } from './orders.js';
import { pieceRoutes } from './pieces.js';
import { catalogueRoutes } from './catalogue.js';
import { settingsRoutes } from './settings.js';
import { teamRoutes } from './team.js';
import { systemRoutes } from './system.js';

const ASSETS_DIR = fileURLToPath(new URL('../../admin-ui/assets/', import.meta.url));
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

export async function adminRoutes(app) {
  registerAuth(app);
  await app.register(fastifyFormbody);
  await app.register(fastifyMultipart, {
    attachFieldsToBody: true,
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 12, fields: 20, fieldSize: 10_000, parts: 40 },
    async onFile(part) {
      part.value = await part.toBuffer(); // throws a 413 when a file is over the limit
    },
  });

  // Admin pages contain customer data: never store them in any cache.
  app.addHook('onSend', async (request, reply, payload) => {
    if (request.url.startsWith('/admin/assets/')) return payload;
    reply.header('cache-control', 'no-store');
    if (String(reply.getHeader('content-type')).startsWith('text/html')) {
      reply.header('speculation-rules', '"/admin/assets/speculation-rules.json"');
    }
    return payload;
  });

  app.get('/assets/speculation-rules.json', async (request, reply) =>
    reply.type('application/speculationrules+json').header('cache-control', 'public, max-age=86400').send(SPECULATION_RULES));

  await app.register(fastifyStatic, {
    root: ASSETS_DIR,
    prefix: '/assets/',
    decorateReply: false,
    index: false,
    cacheControl: false,
    setHeaders: (reply) => reply.header('cache-control', `public, max-age=${ONE_YEAR_SECONDS}, immutable`),
  });

  await app.register(authRoutes);
  await app.register(dashboardRoutes);
  await app.register(orderRoutes);
  await app.register(pieceRoutes);
  await app.register(catalogueRoutes);
  await app.register(settingsRoutes);
  await app.register(teamRoutes);
  await app.register(systemRoutes);
}
