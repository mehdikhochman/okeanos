// Admin sessions. The browser holds a random token; the database holds only its hash,
// so a leaked database backup cannot be used to log in.
import { randomToken, sha256 } from '../lib/crypto.js';

export const SESSION_IDLE_MS = 12 * 60 * 60 * 1000;
export const SESSION_MAX_MS = 7 * 24 * 60 * 60 * 1000;
// Writing last_seen_at on every click would cost a disk write per page; once a minute is enough.
const TOUCH_EVERY_MS = 60 * 1000;

export function createSessionsRepository(db) {
  const statements = {
    insert: db.prepare(`INSERT INTO sessions (id_hash, user_id, csrf_token, created_at, last_seen_at, user_agent)
                        VALUES (?, ?, ?, ?, ?, ?)`),
    find: db.prepare(`SELECT s.id_hash, s.csrf_token, s.created_at, s.last_seen_at,
                             u.id AS user_id, u.email, u.name, u.role
                      FROM sessions s JOIN users u ON u.id = s.user_id
                      WHERE s.id_hash = ?`),
    touch: db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id_hash = ?'),
    remove: db.prepare('DELETE FROM sessions WHERE id_hash = ?'),
    removeOthers: db.prepare('DELETE FROM sessions WHERE user_id = ? AND id_hash != ?'),
    removeAllForUser: db.prepare('DELETE FROM sessions WHERE user_id = ?'),
    countForUser: db.prepare('SELECT COUNT(*) FROM sessions WHERE user_id = ?').pluck(),
    purge: db.prepare('DELETE FROM sessions WHERE last_seen_at < ? OR created_at < ?'),
  };

  return {
    create(userId, userAgent = '') {
      const token = randomToken(32);
      const csrfToken = randomToken(32);
      const now = Date.now();
      statements.insert.run(sha256(token), userId, csrfToken, now, now, userAgent.slice(0, 200));
      return token;
    },

    // Returns the session with its user, or null if missing or expired.
    findValid(token, now = Date.now()) {
      if (!token) return null;
      const idHash = sha256(token);
      const session = statements.find.get(idHash);
      if (!session) return null;
      const expired = now - session.last_seen_at > SESSION_IDLE_MS || now - session.created_at > SESSION_MAX_MS;
      if (expired) {
        statements.remove.run(idHash);
        return null;
      }
      if (now - session.last_seen_at > TOUCH_EVERY_MS) statements.touch.run(now, idHash);
      return session;
    },

    destroy: (token) => token && statements.remove.run(sha256(token)),
    destroyOthers: (userId, idHash) => statements.removeOthers.run(userId, idHash),
    destroyAllForUser: (userId) => statements.removeAllForUser.run(userId),
    countForUser: (userId) => statements.countForUser.get(userId),
    purgeExpired: (now = Date.now()) => statements.purge.run(now - SESSION_IDLE_MS, now - SESSION_MAX_MS),
  };
}
