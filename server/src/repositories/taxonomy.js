// Categories (Earrings, Rings...) and collections (Summer 2025...).
import { createPositionTools } from './positions.js';

export function createCategoriesRepository(db) {
  const positions = createPositionTools(db, 'categories');
  const statements = {
    list: db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM pieces p WHERE p.category_id = c.id AND p.status != 'archived') AS piece_count
                      FROM categories c ORDER BY c.position, c.id`),
    get: db.prepare('SELECT * FROM categories WHERE id = ?'),
    slugTaken: db.prepare('SELECT COUNT(*) FROM categories WHERE slug = ? AND id != ?').pluck(),
    insert: db.prepare('INSERT INTO categories (slug, name, position) VALUES (?, ?, ?)'),
    update: db.prepare('UPDATE categories SET slug = ?, name = ? WHERE id = ?'),
    remove: db.prepare('DELETE FROM categories WHERE id = ?'),
    usage: db.prepare('SELECT COUNT(*) FROM pieces WHERE category_id = ?').pluck(),
  };

  return {
    list: () => statements.list.all(),
    get: (id) => statements.get.get(id),
    isSlugTaken: (slug, exceptId = 0) => statements.slugTaken.get(slug, exceptId) > 0,
    create: ({ slug, name }) => Number(statements.insert.run(slug, name, positions.nextPosition()).lastInsertRowid),
    update: (id, { slug, name }) => statements.update.run(slug, name, id),
    pieceCount: (id) => statements.usage.get(id),
    remove: (id) => statements.remove.run(id),
    move: positions.move,
  };
}

export function createCollectionsRepository(db) {
  const positions = createPositionTools(db, 'collections');
  const statements = {
    list: db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM piece_collections pc WHERE pc.collection_id = c.id) AS piece_count
                      FROM collections c ORDER BY c.position, c.id`),
    get: db.prepare('SELECT * FROM collections WHERE id = ?'),
    slugTaken: db.prepare('SELECT COUNT(*) FROM collections WHERE slug = ? AND id != ?').pluck(),
    insert: db.prepare('INSERT INTO collections (slug, name, description, is_visible, position) VALUES (?, ?, ?, ?, ?)'),
    update: db.prepare('UPDATE collections SET slug = ?, name = ?, description = ?, is_visible = ? WHERE id = ?'),
    remove: db.prepare('DELETE FROM collections WHERE id = ?'),
  };

  return {
    list: () => statements.list.all(),
    get: (id) => statements.get.get(id),
    isSlugTaken: (slug, exceptId = 0) => statements.slugTaken.get(slug, exceptId) > 0,
    create({ slug, name, description, isVisible }) {
      const result = statements.insert.run(slug, name, description, isVisible ? 1 : 0, positions.nextPosition());
      return Number(result.lastInsertRowid);
    },
    update: (id, { slug, name, description, isVisible }) => statements.update.run(slug, name, description, isVisible ? 1 : 0, id),
    remove: (id) => statements.remove.run(id),
    move: positions.move,
  };
}
