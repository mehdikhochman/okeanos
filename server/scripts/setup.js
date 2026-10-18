// Prepares the database. Runs on every Vercel deploy (the "vercel-build" script) and is safe to repeat:
//   1. creates or updates the tables,
//   2. loads the starting catalogue if the shop is empty,
//   3. creates the first owner from OWNER_EMAIL / OWNER_PASSWORD if there is no account yet.
// It never stops a deploy for a missing optional value; it explains what to set instead.
import path from 'node:path';
import { config } from '../src/config.js';
import { migrateDatabase, openDatabase } from '../src/db/database.js';
import { createRepositories } from '../src/repositories/index.js';
import { createMediaStore } from '../src/lib/media.js';
import { hashPassword, MIN_PASSWORD_LENGTH } from '../src/lib/crypto.js';
import { seedCatalogue } from './seed.js';

const log = (message) => console.log(`[setup] ${message}`);

async function createFirstOwner(repos) {
  if ((await repos.users.count()) > 0) return;
  const email = process.env.OWNER_EMAIL;
  const password = process.env.OWNER_PASSWORD ?? '';
  if (!email || password.length < MIN_PASSWORD_LENGTH) {
    log(`No admin account yet. Set OWNER_EMAIL and OWNER_PASSWORD (at least ${MIN_PASSWORD_LENGTH} characters) and redeploy.`);
    return;
  }
  await repos.users.create({ email, name: process.env.OWNER_NAME ?? 'Owner', role: 'owner', passwordHash: await hashPassword(password) });
  await repos.activity.log(null, 'user.create', `created the owner account ${email} during setup`);
  log(`Created the owner account ${email}. You can remove OWNER_PASSWORD from the environment now.`);
}

await migrateDatabase({ url: config.databaseUrl, authToken: config.databaseToken });
log('Database tables are up to date.');

const db = await openDatabase({ url: config.databaseUrl, authToken: config.databaseToken, migrate: false });
const repos = createRepositories(db);
const media = createMediaStore({ driver: config.mediaDriver, mediaDir: path.join(config.dataDir, 'media'), blobToken: config.blobToken });
if (await seedCatalogue({ repos, media, log })) await repos.settings.bumpCatalogueVersion();
await createFirstOwner(repos);
db.close();
log('Done.');
