// Jewellery pieces with their options, images and collections.
import { createPositionTools } from './positions.js';
import { slugify } from '../lib/form.js';

export const FINISHES = ['gold', 'rose', 'silver', 'mixed'];
export const ACCENTS = ['gold', 'enamel', 'beads', 'pearls', 'stones'];
export const STATUSES = ['draft', 'published', 'archived'];
export const AVAILABILITIES = ['made_to_order', 'sold_out'];

export function createPiecesRepository(db) {
  const positions = createPositionTools(db, 'pieces');

  const statements = {
    adminList: db.prepare(`
      SELECT p.id, p.name, p.slug, p.status, p.badge, p.price_cents, p.availability, p.position, p.updated_at,
             c.name AS category_name,
             (SELECT i.file_key FROM piece_images pi JOIN images i ON i.id = pi.image_id
              WHERE pi.piece_id = p.id ORDER BY pi.role = 'cutout' DESC, pi.position LIMIT 1) AS thumb_key
      FROM pieces p JOIN categories c ON c.id = p.category_id
      WHERE (@status = '' AND p.status != 'archived' OR p.status = @status)
        AND (@categoryId = 0 OR p.category_id = @categoryId)
        AND (@q = '' OR p.name LIKE '%' || @q || '%' OR p.type_label LIKE '%' || @q || '%')
      ORDER BY p.position, p.id`),
    get: db.prepare('SELECT * FROM pieces WHERE id = ?'),
    published: db.prepare(`SELECT p.*, c.slug AS category_slug FROM pieces p
                           JOIN categories c ON c.id = p.category_id
                           WHERE p.status = 'published' ORDER BY p.position, p.id`),
    forOrder: db.prepare("SELECT id, name, price_cents, availability FROM pieces WHERE id = ? AND status = 'published'"),
    slugTaken: db.prepare('SELECT COUNT(*) FROM pieces WHERE slug = ? AND id != ?').pluck(),
    insert: db.prepare(`
      INSERT INTO pieces (slug, name, type_label, category_id, finish, accent, badge, is_new, description,
                          price_cents, status, availability, option_label, instagram_url, position)
      VALUES (@slug, @name, @typeLabel, @categoryId, @finish, @accent, @badge, @isNew, @description,
              @priceCents, @status, @availability, @optionLabel, @instagramUrl, @position)`),
    update: db.prepare(`
      UPDATE pieces SET slug = @slug, name = @name, type_label = @typeLabel, category_id = @categoryId,
             finish = @finish, accent = @accent, badge = @badge, is_new = @isNew, description = @description,
             price_cents = @priceCents, status = @status, availability = @availability,
             option_label = @optionLabel, instagram_url = @instagramUrl,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = @id`),
    setStatus: db.prepare("UPDATE pieces SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?"),
    remove: db.prepare('DELETE FROM pieces WHERE id = ?'),
    countByStatus: db.prepare('SELECT status, COUNT(*) AS count FROM pieces GROUP BY status'),
    usedInOrders: db.prepare('SELECT COUNT(*) FROM order_items WHERE piece_id = ?').pluck(),

    options: db.prepare('SELECT label, swatch FROM piece_options WHERE piece_id = ? ORDER BY position, id'),
    clearOptions: db.prepare('DELETE FROM piece_options WHERE piece_id = ?'),
    insertOption: db.prepare('INSERT INTO piece_options (piece_id, label, swatch, position) VALUES (?, ?, ?, ?)'),

    images: db.prepare(`SELECT pi.image_id, pi.role, pi.alt, pi.position, i.file_key, i.width, i.height, i.has_alpha
                        FROM piece_images pi JOIN images i ON i.id = pi.image_id
                        WHERE pi.piece_id = ? ORDER BY pi.position, pi.image_id`),
    imageIds: db.prepare('SELECT image_id FROM piece_images WHERE piece_id = ? ORDER BY position, image_id').pluck(),
    insertImage: db.prepare(`INSERT OR IGNORE INTO piece_images (piece_id, image_id, role, alt, position)
                             VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(position), 0) + 10 FROM piece_images WHERE piece_id = ?))`),
    updateImage: db.prepare('UPDATE piece_images SET role = ?, alt = ? WHERE piece_id = ? AND image_id = ?'),
    setImagePosition: db.prepare('UPDATE piece_images SET position = ? WHERE piece_id = ? AND image_id = ?'),
    removeImage: db.prepare('DELETE FROM piece_images WHERE piece_id = ? AND image_id = ?'),

    collectionIds: db.prepare('SELECT collection_id FROM piece_collections WHERE piece_id = ?').pluck(),
    collectionSlugs: db.prepare(`SELECT c.slug FROM piece_collections pc JOIN collections c ON c.id = pc.collection_id
                                 WHERE pc.piece_id = ? AND c.is_visible = 1`).pluck(),
    clearCollections: db.prepare('DELETE FROM piece_collections WHERE piece_id = ?'),
    insertCollection: db.prepare('INSERT OR IGNORE INTO piece_collections (piece_id, collection_id) VALUES (?, ?)'),
  };

  function uniqueSlug(name, exceptId = 0) {
    const base = slugify(name);
    let slug = base;
    for (let n = 2; statements.slugTaken.get(slug, exceptId) > 0; n += 1) slug = `${base}-${n}`;
    return slug;
  }

  const setOptions = db.transaction((pieceId, options) => {
    statements.clearOptions.run(pieceId);
    options.forEach((option, index) => statements.insertOption.run(pieceId, option.label, option.swatch, index));
  });

  const setCollections = db.transaction((pieceId, collectionIds) => {
    statements.clearCollections.run(pieceId);
    collectionIds.forEach((collectionId) => statements.insertCollection.run(pieceId, collectionId));
  });

  const toRow = (piece) => ({ ...piece, isNew: piece.isNew ? 1 : 0 });

  return {
    list: ({ q = '', status = '', categoryId = 0 } = {}) => statements.adminList.all({ q, status, categoryId }),

    get(id) {
      const piece = statements.get.get(id);
      if (!piece) return null;
      return {
        ...piece,
        options: statements.options.all(id),
        images: statements.images.all(id),
        collectionIds: statements.collectionIds.all(id),
      };
    },

    // Everything the storefront needs, in display order.
    listPublished() {
      return statements.published.all().map((piece) => ({
        ...piece,
        options: statements.options.all(piece.id),
        images: statements.images.all(piece.id),
        collectionSlugs: statements.collectionSlugs.all(piece.id),
      }));
    },

    getForOrder: (id) => statements.forOrder.get(id),
    optionLabels: (id) => statements.options.all(id).map((option) => option.label),

    create: db.transaction((piece) => {
      const row = { ...toRow(piece), slug: uniqueSlug(piece.name), position: positions.nextPosition() };
      const id = Number(statements.insert.run(row).lastInsertRowid);
      setOptions(id, piece.options ?? []);
      setCollections(id, piece.collectionIds ?? []);
      return id;
    }),

    update: db.transaction((id, piece) => {
      statements.update.run({ ...toRow(piece), id, slug: uniqueSlug(piece.name, id) });
      setOptions(id, piece.options ?? []);
      setCollections(id, piece.collectionIds ?? []);
    }),

    duplicate: db.transaction((id) => {
      const source = statements.get.get(id);
      const copyId = Number(statements.insert.run({
        slug: uniqueSlug(`${source.name} copy`),
        name: `${source.name} (copy)`,
        typeLabel: source.type_label,
        categoryId: source.category_id,
        finish: source.finish,
        accent: source.accent,
        badge: source.badge,
        isNew: source.is_new,
        description: source.description,
        priceCents: source.price_cents,
        status: 'draft',
        availability: source.availability,
        optionLabel: source.option_label,
        instagramUrl: source.instagram_url,
        position: positions.nextPosition(),
      }).lastInsertRowid);
      setOptions(copyId, statements.options.all(id));
      setCollections(copyId, statements.collectionIds.all(id));
      for (const image of statements.images.all(id)) {
        statements.insertImage.run(copyId, image.image_id, image.role, image.alt, copyId);
      }
      return copyId;
    }),

    setStatus: db.transaction((ids, status) => ids.forEach((id) => statements.setStatus.run(status, id))),

    // Pieces that appear in past orders are archived instead, so order history stays readable.
    // Returns the ids of images that may now be unused, so the caller can clean up files.
    remove(id) {
      if (statements.usedInOrders.get(id) > 0) {
        statements.setStatus.run('archived', id);
        return { archived: true, imageIds: [] };
      }
      const imageIds = statements.imageIds.all(id);
      statements.remove.run(id);
      return { archived: false, imageIds };
    },

    move: positions.move,

    countByStatus() {
      const counts = { draft: 0, published: 0, archived: 0 };
      for (const row of statements.countByStatus.all()) counts[row.status] = row.count;
      return counts;
    },

    addImage: (pieceId, imageId, role, alt = '') => statements.insertImage.run(pieceId, imageId, role, alt, pieceId),
    updateImage: (pieceId, imageId, { role, alt }) => statements.updateImage.run(role, alt, pieceId, imageId),
    removeImage: (pieceId, imageId) => statements.removeImage.run(pieceId, imageId),

    moveImage: db.transaction((pieceId, imageId, direction) => {
      const ids = statements.imageIds.all(pieceId);
      const from = ids.indexOf(imageId);
      const to = direction === 'up' ? from - 1 : from + 1;
      if (from === -1 || to < 0 || to >= ids.length) return;
      [ids[from], ids[to]] = [ids[to], ids[from]];
      ids.forEach((id, index) => statements.setImagePosition.run((index + 1) * 10, pieceId, id));
    }),
  };
}
