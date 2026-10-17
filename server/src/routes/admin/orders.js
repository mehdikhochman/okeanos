// Viewing and processing orders.
import { notFound } from '../../lib/http-error.js';
import { formatDate } from '../../lib/format.js';
import { ORDER_STATUSES, ORDER_STATUS_LABELS } from '../../repositories/orders.js';
import { orderDetailPage, ordersListPage } from '../../admin-ui/views/orders.js';
import { pageContext, parseId, parsePage, logActivity, redirect, sendPage } from './helpers.js';

const PAGE_SIZE = 50;
const CSV_COLUMNS = ['Order', 'Placed', 'Status', 'Name', 'Phone', 'Email', 'City', 'Address', 'Customer note',
  'Map pin', 'Pieces', 'Subtotal', 'Delivery', 'Total', 'Currency', 'Private note'];

// A cell starting with = + - @ would run as a formula in Excel. Prefixing it with ' keeps it as text.
function csvCell(value) {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

const amount = (cents) => (cents === null ? '' : (cents / 100).toFixed(2));

function orderToCsvRow(order) {
  return [
    order.number, formatDate(order.created_at), ORDER_STATUS_LABELS[order.status], order.customer_name, order.phone,
    order.email, order.city, order.address, order.customer_note,
    order.latitude === null ? '' : `${order.latitude},${order.longitude}`,
    order.items.map((item) => `${item.quantity} x ${item.piece_name}${item.option_label ? ` (${item.option_label})` : ''}`).join('; '),
    amount(order.subtotal_cents), amount(order.delivery_cents), amount(order.total_cents), order.currency, order.admin_note,
  ].map(csvCell).join(',');
}

function readStatus(value) {
  return ORDER_STATUSES.includes(value) ? value : null;
}

export async function orderRoutes(app) {
  const { orders, settings } = app.repos;

  app.get('/orders', async (request, reply) => {
    const filters = {
      status: readStatus(request.query.status) ?? '',
      q: String(request.query.q ?? '').trim().slice(0, 80),
    };
    const page = parsePage(request.query.page);
    const total = orders.count(filters);
    return sendPage(reply, ordersListPage({
      ctx: pageContext(app, request),
      orders: orders.list({ ...filters, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
      counts: orders.countByStatus(),
      filters,
      page,
      pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    }));
  });

  app.get('/orders.csv', async (request, reply) => {
    const rows = orders.exportAll().map(orderToCsvRow);
    const csv = `﻿${[CSV_COLUMNS.map(csvCell).join(','), ...rows].join('\r\n')}\r\n`; // BOM so Excel reads UTF-8
    const date = new Date().toISOString().slice(0, 10);
    logActivity(app, request, 'order.export', 'downloaded all orders as CSV');
    return reply
      .type('text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="okeanos-orders-${date}.csv"`)
      .send(csv);
  });

  app.get('/orders/:id', async (request, reply) => {
    const order = orders.get(parseId(request.params.id));
    if (!order) throw notFound('Order');
    return sendPage(reply, orderDetailPage({ ctx: pageContext(app, request), order, brandName: settings.getAll().brand_name }));
  });

  app.post('/orders/:id', async (request, reply) => {
    const order = orders.get(parseId(request.params.id));
    if (!order) throw notFound('Order');
    const status = readStatus(request.body.status) ?? order.status;
    const adminNote = String(request.body.admin_note ?? '').slice(0, 1000);
    orders.update(order.id, { status, adminNote });
    logActivity(app, request, 'order.update', `updated order ${order.number} (${ORDER_STATUS_LABELS[status]})`);
    return redirect(reply, `/admin/orders/${order.id}`, 'saved');
  });

  app.post('/orders/:id/status', async (request, reply) => {
    const order = orders.get(parseId(request.params.id));
    if (!order) throw notFound('Order');
    const status = readStatus(request.body.status) ?? order.status;
    orders.update(order.id, { status, adminNote: order.admin_note });
    logActivity(app, request, 'order.status', `marked order ${order.number} as ${ORDER_STATUS_LABELS[status].toLowerCase()}`);
    return redirect(reply, `/admin/orders/${order.id}`, 'saved');
  });

  app.post('/orders/:id/delete', { config: { role: 'owner' } }, async (request, reply) => {
    const order = orders.get(parseId(request.params.id));
    if (!order) throw notFound('Order');
    orders.remove(order.id);
    logActivity(app, request, 'order.delete', `deleted order ${order.number}`);
    return redirect(reply, '/admin/orders', 'deleted');
  });
}
