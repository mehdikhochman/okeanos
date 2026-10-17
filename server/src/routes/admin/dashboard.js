import { dashboardPage } from '../../admin-ui/views/dashboard.js';
import { pageContext, sendPage } from './helpers.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days) => new Date(Date.now() - days * DAY_MS).toISOString();

export async function dashboardRoutes(app) {
  const { orders, pieces, activity, settings } = app.repos;

  app.get('/', async (request, reply) => {
    const ctx = pageContext(app, request);
    return sendPage(reply, dashboardPage({
      ctx,
      settings: settings.getAll(),
      stats: {
        newOrders: ctx.newOrders,
        week: orders.totalsSince(daysAgo(7)),
        month: orders.totalsSince(daysAgo(30)),
        pieces: pieces.countByStatus(),
      },
      recentOrders: orders.list({ limit: 6 }),
      topPieces: orders.topPieces(daysAgo(30)),
      activity: activity.list({ limit: 8 }),
    }));
  });
}
