import { dashboardPage } from '../../admin-ui/views/dashboard.js';
import { pageContext, sendPage } from './helpers.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days) => new Date(Date.now() - days * DAY_MS).toISOString();

export async function dashboardRoutes(app) {
  const { orders, pieces, activity, settings } = app.repos;

  app.get('/', async (request, reply) => {
    // Independent queries run in parallel: on Turso each one is a network round trip.
    const [ctx, shopSettings, week, month, pieceCounts, recentOrders, topPieces, recentActivity] = await Promise.all([
      pageContext(app, request),
      settings.getAll(),
      orders.totalsSince(daysAgo(7)),
      orders.totalsSince(daysAgo(30)),
      pieces.countByStatus(),
      orders.list({ limit: 6 }),
      orders.topPieces(daysAgo(30)),
      activity.list({ limit: 8 }),
    ]);
    return sendPage(reply, dashboardPage({
      ctx,
      settings: shopSettings,
      stats: { newOrders: ctx.newOrders, week, month, pieces: pieceCounts },
      recentOrders,
      topPieces,
      activity: recentActivity,
    }));
  });
}
