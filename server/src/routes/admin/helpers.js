// Small helpers every admin route uses, so each route reads as: parse, check, act, respond.
import { badRequest, notFound } from '../../lib/http-error.js';
import { ACCEPTED_IMAGE_TYPES } from '../../lib/media.js';

export function pageContext(app, request) {
  return {
    admin: request.admin,
    newOrders: app.repos.orders.count({ status: 'new' }),
    notice: typeof request.query?.notice === 'string' ? request.query.notice : '',
  };
}

export function sendPage(reply, page, statusCode = 200) {
  return reply.code(statusCode).type('text/html; charset=utf-8').send(page.toString());
}

// 303 makes the browser follow with a GET, so refreshing never re-submits a form.
export function redirect(reply, url, notice) {
  const target = notice ? `${url}${url.includes('?') ? '&' : '?'}notice=${notice}` : url;
  return reply.redirect(target, 303);
}

export function parseId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw notFound();
  return id;
}

export function parseDirection(value) {
  return value === 'up' ? 'up' : 'down';
}

export function parsePage(value) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

export function logActivity(app, request, action, summary) {
  app.repos.activity.log(request.admin.user_id, action, summary);
}

// For changes that customers can see: logged, and the cached storefront is rebuilt.
export function recordChange(app, request, action, summary) {
  logActivity(app, request, action, summary);
  app.storefront.invalidate();
}

// Uploaded files arrive (already size-limited) on request.body.photos, as one part or a list.
export function uploadedFiles(request) {
  const parts = [request.body?.photos].flat().filter((part) => part?.type === 'file' && part.value?.length);
  if (!parts.length) throw badRequest('Choose at least one photo to upload.');
  for (const part of parts) {
    if (!ACCEPTED_IMAGE_TYPES.includes(part.mimetype)) throw badRequest(`"${part.filename}" is not a JPEG, PNG or WebP image.`);
  }
  return parts;
}

export async function storeImage(app, buffer) {
  const saved = await app.media.save(buffer);
  return app.repos.images.save(saved);
}

export async function deleteImageIfUnused(app, imageId) {
  const fileKey = app.repos.images.removeIfUnused(imageId);
  if (fileKey) await app.media.remove(fileKey);
}
