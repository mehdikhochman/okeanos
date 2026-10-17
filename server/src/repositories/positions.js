// Manual ordering ("move up / move down") shared by every list the admin can reorder.

const ORDERED_TABLES = new Set(['categories', 'collections', 'pieces', 'lookbook_photos', 'guide_entries']);

export function createPositionTools(db, table) {
  if (!ORDERED_TABLES.has(table)) throw new Error(`Not an orderable table: ${table}`);

  // Table names cannot be SQL parameters. This one comes from the fixed list above, never from input.
  const all = db.prepare(`SELECT id FROM ${table} ORDER BY position, id`).pluck();
  const setPosition = db.prepare(`UPDATE ${table} SET position = ? WHERE id = ?`);
  const last = db.prepare(`SELECT COALESCE(MAX(position), 0) FROM ${table}`).pluck();

  const move = db.transaction((id, direction) => {
    const ids = all.all();
    const from = ids.indexOf(id);
    const to = direction === 'up' ? from - 1 : from + 1;
    if (from === -1 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    ids.forEach((rowId, index) => setPosition.run((index + 1) * 10, rowId));
  });

  return {
    move,
    nextPosition: () => last.get() + 10,
  };
}
