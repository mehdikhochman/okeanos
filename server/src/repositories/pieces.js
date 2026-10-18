// Jewellery pieces with their options, images and collections.
import { statement } from '../db/database.js';
import { createPositionTools } from './positions.js';
import { slugify } from '../lib/form.js';

export const FINISHES = ['gold', 'rose', 'silver', 'mixed'];
export const ACCENTS = ['gold', 'enamel', 'beads', 'pearls', 'stones'];
export const STATUSES = ['draft', 'published', 'archived'];
export const AVAILABILITIES = ['made_to_order', 'sold_out'];

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";
const IMAGE_COLUMNS = `pi.piece_id, pi.image_id, pi.role, pi.alt, pi.position,
                       i.file_key, i.width, i.height, i.has_alpha, i.base_url`;

function groupBy(rows, key) {
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row[key])) groups.set(row[key], []);
    groups.get(row[key]).push(row);
  }
  return groups;
}

// Field order used by both INSERT and UPDATE.
function pieceArgs(piece) {
  return {
    name: piece.name, typeLabel: piece.typeLabel, categoryId: piece.categoryId, finish: piece.finish,
    accent: piece.accent, badge: piece.badge, isNew: piece.isNew, description: piece.description,
    priceCents: piece.priceCents, status: piece.status, availability: piece.availability,
    optionLabel: piece.optionLabel, instagramUrl: piece.instagramUrl,
  };
}

function optionAndCollectionStatements(pieceId, piece) {
  return [
    statement('DELETE FROM piece_options WHERE piece_id = ?', [pieceId]),
    ...(piece.options ?? []).map((option, index) =>
      statement('INSERT INTO piece_options (piece_id, label, swatch, position) VALUES (?, ?, ?, ?)', [pieceId, option.label, option.swatch, index])),
    statement('DELETE FROM piece_collections WHERE piece_id = ?', [pieceId]),
    ...(piece.collectionIds ?? []).map((collectionId) =>
      statement('INSERT OR IGNORE INTO piece_collections (piece_id, collection_id) VALUES (?, ?)', [pieceId, collectionId])),
  ];
}

export function createPiecesRepository(db) {
  const positions = createPositionTools(db, 'pieces');
  const imagesOf = (pieceId) => db.all(`SELECT ${IMAGE_COLUMNS} FROM piece_images pi JOIN images i ON i.id = pi.image_id
                                        WHERE pi.piece_id = ? ORDER BY pi.position, pi.image_id`, [pieceId]);
  const optionsOf = (pieceId) => db.all('SELECT label, swatch FROM piece_options WHERE piece_id = ? ORDER BY position, id', [pieceId]);
  const imageIdsOf = async (pieceId) =>
    (await db.all('SELECT image_id FROM piece_images WHERE piece_id = ? ORDER BY position, image_id', [pieceId])).map((row) => row.image_id);

  async function uniqueSlug(name, exceptId = 0) {
    const base = slugify(name);
    let slug = base;
    for (let n = 2; (await db.value('SELECT COUNT(*) FROM pieces WHERE slug = ? AND id != ?', [slug, exceptId])) > 0; n += 1) slug = `${base}-${n}`;
    return slug;
  }

  async function insertPiece(piece, slug) {
    const result = await db.run(`
      INSERT INTO pieces (slug, name, type_label, category_id, finish, accent, badge, is_new, description,
                          price_cents, status, availability, option_label, instagram_url, position)
      VALUES (@slug, @name, @typeLabel, @categoryId, @finish, @accent, @badge, @isNew, @description,
              @priceCents, @status, @availability, @optionLabel, @instagramUrl, @position)`,
    { ...pieceArgs(piece), slug, position: await positions.nextPosition() });
    return result.lastId;
  }

  return {
    list: ({ q = '', status = '', categoryId = 0 } = {}) => db.all(`
      SELECT p.id, p.name, p.slug, p.status, p.badge, p.price_cents, p.availability, p.position, p.updated_at,
             c.name AS category_name,
             (SELECT i.file_key FROM piece_images pi JOIN images i ON i.id = pi.image_id
              WHERE pi.piece_id = p.id ORDER BY pi.role = 'cutout' DESC, pi.position LIMIT 1) AS thumb_key,
             (SELECT i.base_url FROM piece_images pi JOIN images i ON i.id = pi.image_id
              WHERE pi.piece_id = p.id ORDER BY pi.role = 'cutout' DESC, pi.position LIMIT 1) AS thumb_base
      FROM pieces p JOIN categories c ON c.id = p.category_id
      WHERE (@status = '' AND p.status != 'archived' OR p.status = @status)
        AND (@categoryId = 0 OR p.category_id = @categoryId)
        AND (@q = '' OR p.name LIKE '%' || @q || '%' OR p.type_label LIKE '%' || @q || '%')
      ORDER BY p.position, p.id`, { q, status, categoryId }),

    async get(id) {
      const piece = await db.get('SELECT * FROM pieces WHERE id = ?', [id]);
      if (!piece) return null;
      const [options, images, collections] = await Promise.all([
        optionsOf(id),
        imagesOf(id),
        db.all('SELECT collection_id FROM piece_collections WHERE piece_id = ?', [id]),
      ]);
      return { ...piece, options, images, collectionIds: collections.map((row) => row.collection_id) };
    },

    // Everything the storefront needs in four queries, whatever the number of pieces.
    async listPublished() {
      const published = "SELECT id FROM pieces WHERE status = 'published'";
      const [pieces, options, images, collections] = await Promise.all([
        db.all(`SELECT p.*, c.slug AS category_slug FROM pieces p JOIN categories c ON c.id = p.category_id
                WHERE p.status = 'published' ORDER BY p.position, p.id`),
        db.all(`SELECT piece_id, label, swatch FROM piece_options WHERE piece_id IN (${published}) ORDER BY position, id`),
        db.all(`SELECT ${IMAGE_COLUMNS} FROM piece_images pi JOIN images i ON i.id = pi.image_id
                WHERE pi.piece_id IN (${published}) ORDER BY pi.position, pi.image_id`),
        db.all(`SELECT pc.piece_id, c.slug FROM piece_collections pc JOIN collections c ON c.id = pc.collection_id
                WHERE c.is_visible = 1 AND pc.piece_id IN (${published})`),
      ]);
      const optionsByPiece = groupBy(options, 'piece_id');
      const imagesByPiece = groupBy(images, 'piece_id');
      const collectionsByPiece = groupBy(collections, 'piece_id');
      return pieces.map((piece) => ({
        ...piece,
        options: optionsByPiece.get(piece.id) ?? [],
        images: imagesByPiece.get(piece.id) ?? [],
        collectionSlugs: (collectionsByPiece.get(piece.id) ?? []).map((row) => row.slug),
      }));
    },

    findBySlug: (slug) => db.get('SELECT id, name FROM pieces WHERE slug = ?', [slug]),
    imageCount: (id) => db.value('SELECT COUNT(*) FROM piece_images WHERE piece_id = ?', [id]),
    getForOrder: (id) => db.get("SELECT id, name, price_cents, availability FROM pieces WHERE id = ? AND status = 'published'", [id]),
    optionLabels: async (id) => (await optionsOf(id)).map((option) => option.label),

    async create(piece) {
      const id = await insertPiece(piece, await uniqueSlug(piece.name));
      await db.batch(optionAndCollectionStatements(id, piece));
      return id;
    },

    async update(id, piece) {
      const slug = await uniqueSlug(piece.name, id);
      await db.batch([
        statement(`UPDATE pieces SET slug = @slug, name = @name, type_label = @typeLabel, category_id = @categoryId,
                   finish = @finish, accent = @accent, badge = @badge, is_new = @isNew, description = @description,
                   price_cents = @priceCents, status = @status, availability = @availability,
                   option_label = @optionLabel, instagram_url = @instagramUrl, updated_at = ${NOW}
                   WHERE id = @id`, { ...pieceArgs(piece), slug, id }),
        ...optionAndCollectionStatements(id, piece),
      ]);
    },

    async duplicate(id) {
      const source = await this.get(id);
      const copy = {
        name: `${source.name} (copy)`, typeLabel: source.type_label, categoryId: source.category_id, finish: source.finish,
        accent: source.accent, badge: source.badge, isNew: source.is_new, description: source.description,
        priceCents: source.price_cents, status: 'draft', availability: source.availability, optionLabel: source.option_label,
        instagramUrl: source.instagram_url, options: source.options, collectionIds: source.collectionIds,
      };
      const copyId = await this.create(copy);
      await db.batch(source.images.map((image) => statement(
        'INSERT OR IGNORE INTO piece_images (piece_id, image_id, role, alt, position) VALUES (?, ?, ?, ?, ?)',
        [copyId, image.image_id, image.role, image.alt, image.position])));
      return copyId;
    },

    setStatus: (ids, status) => db.batch(ids.map((id) => statement(`UPDATE pieces SET status = ?, updated_at = ${NOW} WHERE id = ?`, [status, id]))),

    // Pieces that appear in past orders are archived instead, so order history stays readable.
    // Returns the ids of images that may now be unused, so the caller can clean up files.
    async remove(id) {
      if ((await db.value('SELECT COUNT(*) FROM order_items WHERE piece_id = ?', [id])) > 0) {
        await db.run(`UPDATE pieces SET status = 'archived', updated_at = ${NOW} WHERE id = ?`, [id]);
        return { archived: true, imageIds: [] };
      }
      const imageIds = await imageIdsOf(id);
      await db.run('DELETE FROM pieces WHERE id = ?', [id]);
      return { archived: false, imageIds };
    },

    move: positions.move,

    async countByStatus() {
      const counts = { draft: 0, published: 0, archived: 0 };
      for (const row of await db.all('SELECT status, COUNT(*) AS count FROM pieces GROUP BY status')) counts[row.status] = row.count;
      return counts;
    },

    addImage: (pieceId, imageId, role, alt = '') => db.run(`
      INSERT OR IGNORE INTO piece_images (piece_id, image_id, role, alt, position)
      VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(position), 0) + 10 FROM piece_images WHERE piece_id = ?))`,
    [pieceId, imageId, role, alt, pieceId]),
    updateImage: (pieceId, imageId, { role, alt }) =>
      db.run('UPDATE piece_images SET role = ?, alt = ? WHERE piece_id = ? AND image_id = ?', [role, alt, pieceId, imageId]),
    removeImage: (pieceId, imageId) => db.run('DELETE FROM piece_images WHERE piece_id = ? AND image_id = ?', [pieceId, imageId]),

    async moveImage(pieceId, imageId, direction) {
      const ids = await imageIdsOf(pieceId);
      const from = ids.indexOf(imageId);
      const to = direction === 'up' ? from - 1 : from + 1;
      if (from === -1 || to < 0 || to >= ids.length) return;
      [ids[from], ids[to]] = [ids[to], ids[from]];
      await db.batch(ids.map((id, index) =>
        statement('UPDATE piece_images SET position = ? WHERE piece_id = ? AND image_id = ?', [(index + 1) * 10, pieceId, id])));
    },
  };
}
