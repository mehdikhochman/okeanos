// Admin accounts and their login protection.

const MAX_FAILED_LOGINS = 5;
const LOCK_MS = 15 * 60 * 1000;

export function createUsersRepository(db) {
  const statements = {
    findByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
    get: db.prepare('SELECT id, email, name, role, last_login_at, created_at FROM users WHERE id = ?'),
    getWithHash: db.prepare('SELECT * FROM users WHERE id = ?'),
    list: db.prepare('SELECT id, email, name, role, last_login_at, created_at FROM users ORDER BY name'),
    insert: db.prepare('INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)'),
    setRole: db.prepare('UPDATE users SET role = ? WHERE id = ?'),
    setPassword: db.prepare('UPDATE users SET password_hash = ?, failed_logins = 0, locked_until = NULL WHERE id = ?'),
    remove: db.prepare('DELETE FROM users WHERE id = ?'),
    countOwners: db.prepare("SELECT COUNT(*) FROM users WHERE role = 'owner'").pluck(),
    countAll: db.prepare('SELECT COUNT(*) FROM users').pluck(),
    failed: db.prepare('UPDATE users SET failed_logins = failed_logins + 1, locked_until = ? WHERE id = ?'),
    succeeded: db.prepare('UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = ? WHERE id = ?'),
  };

  return {
    findByEmail: (email) => statements.findByEmail.get(email),
    get: (id) => statements.get.get(id),
    getWithHash: (id) => statements.getWithHash.get(id),
    list: () => statements.list.all(),
    count: () => statements.countAll.get(),
    countOwners: () => statements.countOwners.get(),

    create({ email, name, passwordHash, role }) {
      return Number(statements.insert.run(email, name, passwordHash, role).lastInsertRowid);
    },

    setRole: (id, role) => statements.setRole.run(role, id),
    setPassword: (id, passwordHash) => statements.setPassword.run(passwordHash, id),
    remove: (id) => statements.remove.run(id),

    isLocked(user, now = Date.now()) {
      return Boolean(user.locked_until) && Date.parse(user.locked_until) > now;
    },

    recordFailedLogin(user, now = Date.now()) {
      const failures = user.failed_logins + 1;
      const lockedUntil = failures >= MAX_FAILED_LOGINS ? new Date(now + LOCK_MS).toISOString() : null;
      statements.failed.run(lockedUntil, user.id);
    },

    recordSuccessfulLogin: (id) => statements.succeeded.run(new Date().toISOString(), id),
  };
}
