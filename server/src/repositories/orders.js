// Orders placed on the website, and the numbers the dashboard shows about them.

export const ORDER_STATUSES = ['new', 'confirmed', 'in_production', 'out_for_delivery', 'delivered', 'cancelled'];
export const ORDER_STATUS_LABELS = {
  new: 'New',
  confirmed: 'Confirmed',
  in_production: 'Being made',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};
const FIRST_ORDER_NUMBER = 1001;

export function createOrdersRepository(db) {
  const statements = {
    nextNumber: db.prepare(`SELECT COALESCE(MAX(id), 0) + ${FIRST_ORDER_NUMBER} FROM orders`).pluck(),
    byKey: db.prepare('SELECT id, number FROM orders WHERE idempotency_key = ?'),
    insert: db.prepare(`
      INSERT INTO orders (number, idempotency_key, customer_name, phone, email, city, address, customer_note,
                          latitude, longitude, location_accuracy_m, currency, subtotal_cents, delivery_cents,
                          total_cents, item_count, ip_hash)
      VALUES (@number, @idempotencyKey, @customerName, @phone, @email, @city, @address, @customerNote,
              @latitude, @longitude, @locationAccuracy, @currency, @subtotalCents, @deliveryCents,
              @totalCents, @itemCount, @ipHash)`),
    insertItem: db.prepare(`INSERT INTO order_items (order_id, piece_id, piece_name, option_label, quantity, unit_price_cents)
                            VALUES (?, ?, ?, ?, ?, ?)`),
    list: db.prepare(`
      SELECT id, number, status, customer_name, phone, city, total_cents, currency, item_count, created_at
      FROM orders
      WHERE (@status = '' OR status = @status)
        AND (@q = '' OR number LIKE '%' || @q || '%' OR customer_name LIKE '%' || @q || '%'
             OR phone LIKE '%' || @q || '%' OR city LIKE '%' || @q || '%')
      ORDER BY id DESC LIMIT @limit OFFSET @offset`),
    count: db.prepare(`SELECT COUNT(*) FROM orders WHERE (@status = '' OR status = @status)
                       AND (@q = '' OR number LIKE '%' || @q || '%' OR customer_name LIKE '%' || @q || '%'
                            OR phone LIKE '%' || @q || '%' OR city LIKE '%' || @q || '%')`).pluck(),
    get: db.prepare('SELECT * FROM orders WHERE id = ?'),
    items: db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id'),
    update: db.prepare(`UPDATE orders SET status = ?, admin_note = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                        WHERE id = ?`),
    remove: db.prepare('DELETE FROM orders WHERE id = ?'),
    countByStatus: db.prepare('SELECT status, COUNT(*) AS count FROM orders GROUP BY status'),
    since: db.prepare(`SELECT COUNT(*) AS orders, COALESCE(SUM(total_cents), 0) AS total_cents
                       FROM orders WHERE created_at >= ? AND status != 'cancelled'`),
    recentFromIp: db.prepare('SELECT COUNT(*) FROM orders WHERE ip_hash = ? AND created_at >= ?').pluck(),
    topPieces: db.prepare(`
      SELECT oi.piece_name, SUM(oi.quantity) AS quantity
      FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE o.created_at >= ? AND o.status != 'cancelled'
      GROUP BY oi.piece_name ORDER BY quantity DESC LIMIT ?`),
    all: db.prepare('SELECT * FROM orders ORDER BY id'),
    allItems: db.prepare('SELECT * FROM order_items ORDER BY order_id, id'),
  };

  return {
    findByIdempotencyKey: (key) => statements.byKey.get(key),

    // Numbers are assigned inside the transaction; SQLite allows one writer at a time,
    // so two orders can never get the same number.
    create: db.transaction((order, items) => {
      const number = `OK-${statements.nextNumber.get()}`;
      const id = Number(statements.insert.run({ ...order, number }).lastInsertRowid);
      for (const item of items) {
        statements.insertItem.run(id, item.pieceId, item.pieceName, item.optionLabel, item.quantity, item.unitPriceCents);
      }
      return { id, number };
    }),

    list: ({ status = '', q = '', limit = 50, offset = 0 } = {}) => statements.list.all({ status, q, limit, offset }),
    count: ({ status = '', q = '' } = {}) => statements.count.get({ status, q }),

    get(id) {
      const order = statements.get.get(id);
      return order ? { ...order, items: statements.items.all(id) } : null;
    },

    update: (id, { status, adminNote }) => statements.update.run(status, adminNote, id),
    remove: (id) => statements.remove.run(id),

    countByStatus() {
      const counts = Object.fromEntries(ORDER_STATUSES.map((status) => [status, 0]));
      for (const row of statements.countByStatus.all()) counts[row.status] = row.count;
      return counts;
    },

    totalsSince: (isoDate) => statements.since.get(isoDate),
    countRecentFromIp: (ipHash, isoDate) => statements.recentFromIp.get(ipHash, isoDate),
    topPieces: (isoDate, limit = 5) => statements.topPieces.all(isoDate, limit),

    exportAll() {
      const itemsByOrder = new Map();
      for (const item of statements.allItems.all()) {
        if (!itemsByOrder.has(item.order_id)) itemsByOrder.set(item.order_id, []);
        itemsByOrder.get(item.order_id).push(item);
      }
      return statements.all.all().map((order) => ({ ...order, items: itemsByOrder.get(order.id) ?? [] }));
    },
  };
}
