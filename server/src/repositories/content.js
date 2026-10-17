// Images, lookbook photos, guide entries, settings and the activity log.
import { createPositionTools } from './positions.js';

export function createImagesRepository(db) {
  const statements = {
    insert: db.prepare('INSERT OR IGNORE INTO images (file_key, width, height, has_alpha) VALUES (?, ?, ?, ?)'),
    byKey: db.prepare('SELECT * FROM images WHERE file_key = ?'),
    get: db.prepare('SELECT * FROM images WHERE id = ?'),
    usage: db.prepare(`SELECT (SELECT COUNT(*) FROM piece_images WHERE image_id = ?)
                            + (SELECT COUNT(*) FROM lookbook_photos WHERE image_id = ?)`).pluck(),
    remove: db.prepare('DELETE FROM images WHERE id = ?'),
  };

  return {
    // The same file uploaded twice is stored once (file_key is a content hash).
    save({ fileKey, width, height, hasAlpha }) {
      statements.insert.run(fileKey, width, height, hasAlpha ? 1 : 0);
      return statements.byKey.get(fileKey);
    },
    get: (id) => statements.get.get(id),
    // Returns the file key when the image is no longer used anywhere, so the files can be deleted.
    removeIfUnused(id) {
      const image = statements.get.get(id);
      if (!image || statements.usage.get(id, id) > 0) return null;
      statements.remove.run(id);
      return image.file_key;
    },
  };
}

export function createLookbookRepository(db) {
  const positions = createPositionTools(db, 'lookbook_photos');
  const statements = {
    list: db.prepare(`SELECT l.*, i.file_key, i.width, i.height FROM lookbook_photos l
                      JOIN images i ON i.id = l.image_id ORDER BY l.position, l.id`),
    get: db.prepare('SELECT * FROM lookbook_photos WHERE id = ?'),
    insert: db.prepare('INSERT INTO lookbook_photos (image_id, caption, position) VALUES (?, ?, ?)'),
    update: db.prepare('UPDATE lookbook_photos SET caption = ?, is_visible = ? WHERE id = ?'),
    remove: db.prepare('DELETE FROM lookbook_photos WHERE id = ?'),
  };

  return {
    list: () => statements.list.all(),
    listVisible: () => statements.list.all().filter((photo) => photo.is_visible),
    get: (id) => statements.get.get(id),
    create: (imageId, caption) => Number(statements.insert.run(imageId, caption, positions.nextPosition()).lastInsertRowid),
    update: (id, { caption, isVisible }) => statements.update.run(caption, isVisible ? 1 : 0, id),
    remove: (id) => statements.remove.run(id),
    move: positions.move,
  };
}

export function createGuideRepository(db) {
  const positions = createPositionTools(db, 'guide_entries');
  const statements = {
    list: db.prepare('SELECT * FROM guide_entries ORDER BY position, id'),
    get: db.prepare('SELECT * FROM guide_entries WHERE id = ?'),
    insert: db.prepare('INSERT INTO guide_entries (question, answer, is_visible, position) VALUES (?, ?, ?, ?)'),
    update: db.prepare('UPDATE guide_entries SET question = ?, answer = ?, is_visible = ? WHERE id = ?'),
    remove: db.prepare('DELETE FROM guide_entries WHERE id = ?'),
  };

  return {
    list: () => statements.list.all(),
    listVisible: () => statements.list.all().filter((entry) => entry.is_visible),
    get: (id) => statements.get.get(id),
    create({ question, answer, isVisible }) {
      return Number(statements.insert.run(question, answer, isVisible ? 1 : 0, positions.nextPosition()).lastInsertRowid);
    },
    update: (id, { question, answer, isVisible }) => statements.update.run(question, answer, isVisible ? 1 : 0, id),
    remove: (id) => statements.remove.run(id),
    move: positions.move,
  };
}

export function createSettingsRepository(db, fields) {
  const statements = {
    all: db.prepare('SELECT key, value FROM settings'),
    upsert: db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value'),
  };
  const defaults = Object.fromEntries(fields.map((field) => [field.key, field.default ?? '']));

  return {
    // Every known key is always present, falling back to its default.
    getAll() {
      const stored = Object.fromEntries(statements.all.all().map((row) => [row.key, row.value]));
      return { ...defaults, ...stored };
    },
    setMany: db.transaction((values) => {
      for (const [key, value] of Object.entries(values)) {
        if (key in defaults) statements.upsert.run(key, String(value));
      }
    }),
  };
}

export function createActivityRepository(db) {
  const statements = {
    insert: db.prepare('INSERT INTO activity_log (user_id, action, summary) VALUES (?, ?, ?)'),
    list: db.prepare(`SELECT a.*, u.name AS user_name FROM activity_log a
                      LEFT JOIN users u ON u.id = a.user_id
                      ORDER BY a.id DESC LIMIT ? OFFSET ?`),
    count: db.prepare('SELECT COUNT(*) FROM activity_log').pluck(),
  };

  return {
    log: (userId, action, summary) => statements.insert.run(userId ?? null, action, summary.slice(0, 300)),
    list: ({ limit = 50, offset = 0 } = {}) => statements.list.all(limit, offset),
    count: () => statements.count.get(),
  };
}
