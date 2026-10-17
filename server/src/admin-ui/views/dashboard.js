import { html } from '../../lib/html.js';
import { formatMoney, timeAgo } from '../../lib/format.js';
import { layout } from '../layout.js';
import { actionButton, statusPill } from '../components.js';

function stat(label, value, href) {
  const content = html`<span class="stat-value">${value}</span><span class="stat-label">${label}</span>`;
  return href ? html`<a class="stat" href="${href}">${content}</a>` : html`<div class="stat">${content}</div>`;
}

export function dashboardPage({ ctx, stats, recentOrders, topPieces, activity, settings }) {
  const ordersOpen = settings.orders_open === '1';
  const shopStatus = html`<section class="panel shop-status ${ordersOpen ? 'open' : 'paused'}">
    <p><b>${ordersOpen ? 'The shop is taking orders.' : 'Orders are paused.'}</b>
      ${ordersOpen ? 'Customers can place orders on the site.' : 'Customers can browse but not order.'}</p>
    ${ctx.admin.role === 'owner' ? actionButton({
      action: '/admin/settings/orders-open', csrf: ctx.admin.csrf_token, className: 'button secondary',
      label: ordersOpen ? 'Pause orders' : 'Resume orders', hidden: { open: ordersOpen ? '0' : '1' },
      confirm: ordersOpen ? 'Pause new orders? Visitors will see your "orders paused" message.' : '',
    }) : ''}
  </section>`;

  return layout({
    ctx, title: 'Dashboard', active: 'dashboard',
    body: html`
      ${shopStatus}
      <div class="stats">
        ${stat('New orders to confirm', stats.newOrders, '/admin/orders?status=new')}
        ${stat('Orders in the last 7 days', stats.week.orders, '/admin/orders')}
        ${stat('Sales in the last 30 days', stats.month.total_cents > 0 ? formatMoney(stats.month.total_cents, settings.currency) : '—')}
        ${stat('Pieces live in the shop', stats.pieces.published, '/admin/pieces?status=published')}
        ${stat('Drafts', stats.pieces.draft, '/admin/pieces?status=draft')}
      </div>
      <div class="columns">
        <section class="panel">
          <h2>Latest orders</h2>
          ${recentOrders.length ? html`<table class="table compact"><tbody>
            ${recentOrders.map((order) => html`<tr>
              <td><a href="/admin/orders/${order.id}">${order.number}</a></td>
              <td>${order.customer_name}<br><span class="muted">${order.city}</span></td>
              <td>${statusPill(order.status)}</td>
              <td class="muted">${timeAgo(order.created_at)}</td></tr>`)}
          </tbody></table><p><a href="/admin/orders">All orders</a></p>` : html`<p class="muted">No orders yet. They appear here as soon as a customer orders on the site.</p>`}
        </section>
        <section class="panel">
          <h2>Most ordered, last 30 days</h2>
          ${topPieces.length ? html`<ol class="ranked">${topPieces.map((row) => html`<li><span>${row.piece_name}</span><b>${row.quantity}</b></li>`)}</ol>`
            : html`<p class="muted">Not enough orders yet.</p>`}
          <h2>Recent changes</h2>
          <ul class="activity">${activity.map((entry) => html`<li><b>${entry.user_name ?? 'System'}</b> ${entry.summary} <span class="muted">${timeAgo(entry.created_at)}</span></li>`)}</ul>
        </section>
      </div>`,
  });
}
