// Activity log and backups.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { activityPage, backupPage } from '../../admin-ui/views/system.js';
import { randomToken } from '../../lib/crypto.js';
import { logActivity, pageContext, parsePage, sendPage } from './helpers.js';

const PAGE_SIZE = 50;

export async function systemRoutes(app) {
  const { activity, db } = app.repos;

  app.get('/activity', async (request, reply) => {
    const page = parsePage(request.query.page);
    return sendPage(reply, activityPage({
      ctx: pageContext(app, request),
      entries: activity.list({ limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
      page,
      pageCount: Math.max(1, Math.ceil(activity.count() / PAGE_SIZE)),
    }));
  });

  app.get('/backup', { config: { role: 'owner' } }, async (request, reply) =>
    sendPage(reply, backupPage({ ctx: pageContext(app, request) })));

  // SQLite's online backup copies a consistent snapshot while the shop keeps running.
  app.post('/backup/database', { config: { role: 'owner' } }, async (request, reply) => {
    const file = path.join(os.tmpdir(), `okeanos-backup-${randomToken(8)}.db`);
    await db.backup(file);
    logActivity(app, request, 'backup.download', 'downloaded a database backup');
    const stream = fs.createReadStream(file);
    stream.on('close', () => fs.rm(file, { force: true }, () => {}));
    return reply
      .type('application/vnd.sqlite3')
      .header('content-disposition', `attachment; filename="okeanos-backup-${new Date().toISOString().slice(0, 10)}.db"`)
      .send(stream);
  });
}
