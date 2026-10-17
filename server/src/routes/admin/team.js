// Team management (owners) and each person's own account.
import { FormReader } from '../../lib/form.js';
import { badRequest, notFound } from '../../lib/http-error.js';
import { generatePassword, hashPassword, MIN_PASSWORD_LENGTH, sha256, verifyPassword } from '../../lib/crypto.js';
import { SESSION_COOKIE } from '../../plugins/auth.js';
import { accountPage, passwordCreatedPage, usersPage } from '../../admin-ui/views/team.js';
import { logActivity, pageContext, parseId, redirect, sendPage } from './helpers.js';

const OWNER_ONLY = { config: { role: 'owner' } };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = ['editor', 'owner'];

export async function teamRoutes(app) {
  const { users, sessions } = app.repos;

  function loadOtherUser(request) {
    const user = users.get(parseId(request.params.id));
    if (!user) throw notFound('Person');
    if (user.id === request.admin.user_id) throw badRequest('Use your account page to change your own access.');
    return user;
  }

  // There must always be someone who can manage the team and settings.
  function assertNotLastOwner(user) {
    if (user.role === 'owner' && users.countOwners() <= 1) throw badRequest('The shop needs at least one owner.');
  }

  const listPage = (request, reply, extra = {}, statusCode = 200) =>
    sendPage(reply, usersPage({ ctx: pageContext(app, request), users: users.list(), ...extra }), statusCode);

  app.get('/users', OWNER_ONLY, async (request, reply) => listPage(request, reply));

  app.post('/users', OWNER_ONLY, async (request, reply) => {
    const form = new FormReader(request.body);
    const name = form.text('name', { label: 'Name', required: true, max: 60 });
    const email = form.text('email', { label: 'Email', required: true, max: 120, pattern: EMAIL, patternMessage: 'Enter a valid email address.' });
    const role = form.oneOf('role', ROLES, { label: 'Role' });
    if (email && users.findByEmail(email)) form.fail('email', 'Someone on the team already uses this email.');
    if (form.hasErrors) return listPage(request, reply, { errors: form.errors, values: form.body }, 400);

    const password = generatePassword();
    const id = users.create({ name, email, role, passwordHash: await hashPassword(password) });
    logActivity(app, request, 'user.create', `added ${name} to the team as ${role}`);
    return sendPage(reply, passwordCreatedPage({ ctx: pageContext(app, request), user: users.get(id), password }));
  });

  app.post('/users/:id/role', OWNER_ONLY, async (request, reply) => {
    const user = loadOtherUser(request);
    const role = ROLES.includes(request.body.role) ? request.body.role : user.role;
    if (role !== user.role) {
      if (role === 'editor') assertNotLastOwner(user);
      users.setRole(user.id, role);
      logActivity(app, request, 'user.role', `made ${user.name} ${role}`);
    }
    return redirect(reply, '/admin/users', 'saved');
  });

  app.post('/users/:id/reset-password', OWNER_ONLY, async (request, reply) => {
    const user = loadOtherUser(request);
    const password = generatePassword();
    users.setPassword(user.id, await hashPassword(password));
    sessions.destroyAllForUser(user.id);
    logActivity(app, request, 'user.password', `created a new password for ${user.name}`);
    return sendPage(reply, passwordCreatedPage({ ctx: pageContext(app, request), user, password }));
  });

  app.post('/users/:id/delete', OWNER_ONLY, async (request, reply) => {
    const user = loadOtherUser(request);
    assertNotLastOwner(user);
    users.remove(user.id);
    logActivity(app, request, 'user.delete', `removed ${user.name} from the team`);
    return redirect(reply, '/admin/users', 'deleted');
  });

  app.get('/account', async (request, reply) =>
    sendPage(reply, accountPage({ ctx: pageContext(app, request), sessionCount: sessions.countForUser(request.admin.user_id) })));

  app.post('/account/password', async (request, reply) => {
    const form = new FormReader(request.body);
    const current = String(form.raw('current_password') ?? '');
    const next = String(form.raw('new_password') ?? '');
    const me = users.getWithHash(request.admin.user_id);

    if (!(await verifyPassword(current, me.password_hash))) form.fail('current_password', 'Your current password is not right.');
    if (next.length < MIN_PASSWORD_LENGTH) form.fail('new_password', `Use at least ${MIN_PASSWORD_LENGTH} characters.`);
    if (next !== form.raw('confirm_password')) form.fail('confirm_password', 'The two new passwords are different.');
    if (form.hasErrors) {
      return sendPage(reply, accountPage({ ctx: pageContext(app, request), errors: form.errors,
        sessionCount: sessions.countForUser(me.id) }), 400);
    }

    users.setPassword(me.id, await hashPassword(next));
    sessions.destroyOthers(me.id, sha256(request.cookies[SESSION_COOKIE]));
    logActivity(app, request, 'user.password', 'changed their password');
    return redirect(reply, '/admin/account', 'password');
  });

  app.post('/account/sessions', async (request, reply) => {
    sessions.destroyOthers(request.admin.user_id, sha256(request.cookies[SESSION_COOKIE]));
    logActivity(app, request, 'user.sessions', 'logged out their other devices');
    return redirect(reply, '/admin/account', 'sessions');
  });
}
