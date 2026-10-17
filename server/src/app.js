// Assembles the application: database, repositories, plugins and routes.
// Kept separate from server.js so tests can build an app without opening a port.
import path from 'node:path';
import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyRateLimit from '@fastify/rate-limit';
import { config } from './config.js';
import { openDatabase } from './db/database.js';
import { createRepositories } from './repositories/index.js';
import { createMediaStore } from './lib/media.js';
import { createStorefront } from './storefront/render.js';
import { registerSecurityHeaders } from './plugins/security-headers.js';
import { registerErrorHandling } from './plugins/errors.js';
import { publicRoutes } from './routes/public.js';
import { adminRoutes } from './routes/admin/index.js';

const HOUR_MS = 60 * 60 * 1000;

export async function buildApp({ dataDir = config.dataDir, databaseFile, logger = true } = {}) {
  const db = openDatabase(databaseFile ?? path.join(dataDir, 'okeanos.db'));
  const repos = createRepositories(db);

  const app = Fastify({
    logger: logger && {
      level: config.isProduction ? 'info' : 'debug',
      redact: ['req.headers.cookie', 'req.headers.authorization', 'req.headers["x-csrf-token"]'],
    },
    trustProxy: config.trustProxy,
    bodyLimit: 64 * 1024, // JSON and forms; image uploads have their own limit in the admin
    // Reject unknown or wrongly-typed fields instead of silently stripping or converting them.
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false } },
  });

  app.decorate('repos', repos);
  app.decorate('media', createMediaStore(path.join(dataDir, 'media')));
  app.decorate('storefront', createStorefront({ repos }));

  await app.register(fastifyCookie);
  await app.register(fastifyRateLimit, { global: false });
  registerSecurityHeaders(app);
  registerErrorHandling(app);

  await app.register(publicRoutes);
  await app.register(adminRoutes, { prefix: '/admin' });

  const purgeTimer = setInterval(() => repos.sessions.purgeExpired(), HOUR_MS);
  purgeTimer.unref();
  app.addHook('onClose', async () => {
    clearInterval(purgeTimer);
    db.close();
  });

  return app;
}
