// Creating and editing pieces, their photos and their order in the shop.
import { FormReader } from '../../lib/form.js';
import { notFound } from '../../lib/http-error.js';
import { ACCENTS, AVAILABILITIES, FINISHES, STATUSES } from '../../repositories/pieces.js';
import { pieceFormPage, piecesListPage } from '../../admin-ui/views/pieces.js';
import {
  deleteImageIfUnused, pageContext, parseDirection, parseId, recordChange, redirect, sendPage, storeImage, uploadedFiles,
} from './helpers.js';

const MAX_OPTIONS = 12;
const HEX_COLOUR = /^#[0-9a-f]{6}$/i;
const INSTAGRAM_URL = /^https:\/\/(www\.)?instagram\.com\/[\w\-./?=&%]+$/;
const BULK_ACTIONS = { publish: 'published', draft: 'draft', archive: 'archived' };

const EMPTY_PIECE = {
  name: '', type_label: '', description: '', price_cents: null, badge: '', is_new: 0, status: 'draft',
  availability: 'made_to_order', category_id: null, finish: 'gold', accent: 'gold', instagram_url: '',
  option_label: '', options: [], collectionIds: [], images: [],
};

// "Pastel, #E9B8C8" per line -> [{ label: 'Pastel', swatch: '#E9B8C8' }]
function readOptions(form) {
  const lines = String(form.raw('options') ?? '').split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines.length > MAX_OPTIONS) {
    form.fail('options', `Use at most ${MAX_OPTIONS} choices.`);
    return [];
  }
  const options = [];
  for (const line of lines) {
    const [label, swatch = ''] = line.split(',').map((part) => part.trim());
    if (!label || label.length > 40) {
      form.fail('options', 'Each choice needs a name of up to 40 characters.');
      return [];
    }
    if (swatch && !HEX_COLOUR.test(swatch)) {
      form.fail('options', `"${swatch}" is not a colour. Use the form #E9B8C8.`);
      return [];
    }
    options.push({ label, swatch });
  }
  return options;
}

async function readPieceForm(body, repos) {
  const form = new FormReader(body);
  const piece = {
    name: form.text('name', { label: 'Name', required: true, max: 80 }),
    typeLabel: form.text('type_label', { label: 'Line under the name', required: true, max: 40 }),
    description: form.text('description', { label: 'Description', max: 600 }),
    priceCents: form.money('price', { label: 'Price' }),
    badge: form.text('badge', { label: 'Badge', max: 24 }),
    isNew: form.checkbox('is_new'),
    status: form.oneOf('status', STATUSES, { label: 'Status' }),
    availability: form.oneOf('availability', AVAILABILITIES, { label: 'Availability' }),
    categoryId: form.integer('category_id', { label: 'Category', required: true, min: 1 }),
    finish: form.oneOf('finish', FINISHES, { label: 'Finish' }),
    accent: form.oneOf('accent', ACCENTS, { label: 'Accent' }),
    instagramUrl: form.text('instagram_url', {
      label: 'Instagram post', max: 200, pattern: INSTAGRAM_URL, patternMessage: 'Paste a link that starts with https://www.instagram.com/',
    }),
    optionLabel: form.text('option_label', { label: 'Option name', max: 24 }),
    options: readOptions(form),
    collectionIds: form.idList('collection_ids'),
  };
  if (piece.categoryId && !(await repos.categories.get(piece.categoryId))) form.fail('category_id', 'Choose a category.');
  if (piece.options.length && !piece.optionLabel) form.fail('option_label', 'Give the choices a name, like "Colour".');
  return { piece, form };
}

// What the form shows again after an error: the values just typed, in the view's shape.
function asView(piece, existing = EMPTY_PIECE) {
  return {
    ...existing,
    name: piece.name ?? '', type_label: piece.typeLabel ?? '', description: piece.description ?? '',
    price_cents: piece.priceCents, badge: piece.badge ?? '', is_new: piece.isNew, status: piece.status ?? 'draft',
    availability: piece.availability ?? 'made_to_order', category_id: piece.categoryId, finish: piece.finish ?? 'gold',
    accent: piece.accent ?? 'gold', instagram_url: piece.instagramUrl ?? '', option_label: piece.optionLabel ?? '',
    options: piece.options ?? [], collectionIds: piece.collectionIds,
  };
}

export async function pieceRoutes(app) {
  const { pieces, categories, collections } = app.repos;

  async function formPage(request, reply, { piece, errors, isNew, statusCode }) {
    return sendPage(reply, pieceFormPage({
      ctx: await pageContext(app, request), piece, errors, isNew,
      categories: await categories.list(), collections: await collections.list(),
    }), statusCode);
  }

  async function loadPiece(id) {
    const piece = await pieces.get(parseId(id));
    if (!piece) throw notFound('Piece');
    return piece;
  }

  app.get('/pieces', async (request, reply) => {
    const filters = {
      q: String(request.query.q ?? '').trim().slice(0, 80),
      status: STATUSES.includes(request.query.status) ? request.query.status : '',
      categoryId: Number(request.query.category) || 0,
    };
    return sendPage(reply, piecesListPage({
      ctx: await pageContext(app, request), pieces: await pieces.list(filters), categories: await categories.list(),
      filters, currency: (await app.repos.settings.getAll()).currency,
    }));
  });

  app.get('/pieces/new', async (request, reply) =>
    formPage(request, reply, { piece: { ...EMPTY_PIECE, category_id: (await categories.list())[0]?.id }, isNew: true }));

  app.post('/pieces', async (request, reply) => {
    const { piece, form } = await readPieceForm(request.body, app.repos);
    if (form.hasErrors) return formPage(request, reply, { piece: asView(piece), errors: form.errors, isNew: true, statusCode: 400 });
    const id = await pieces.create(piece);
    await recordChange(app, request, 'piece.create', `added the piece "${piece.name}"`);
    return redirect(reply, `/admin/pieces/${id}`, 'created');
  });

  app.get('/pieces/:id', async (request, reply) => formPage(request, reply, { piece: await loadPiece(request.params.id) }));

  app.post('/pieces/:id', async (request, reply) => {
    const existing = await loadPiece(request.params.id);
    const { piece, form } = await readPieceForm(request.body, app.repos);
    if (form.hasErrors) return formPage(request, reply, { piece: asView(piece, existing), errors: form.errors, statusCode: 400 });
    await pieces.update(existing.id, piece);
    await recordChange(app, request, 'piece.update', `edited "${piece.name}"`);
    return redirect(reply, `/admin/pieces/${existing.id}`, 'saved');
  });

  app.post('/pieces/:id/move', async (request, reply) => {
    const piece = await loadPiece(request.params.id);
    await pieces.move(piece.id, parseDirection(request.body.direction ?? request.query.direction));
    await recordChange(app, request, 'piece.move', `moved "${piece.name}" in the shop order`);
    return redirect(reply, '/admin/pieces', 'moved');
  });

  app.post('/pieces/:id/duplicate', async (request, reply) => {
    const piece = await loadPiece(request.params.id);
    const copyId = await pieces.duplicate(piece.id);
    await recordChange(app, request, 'piece.duplicate', `duplicated "${piece.name}"`);
    return redirect(reply, `/admin/pieces/${copyId}`, 'created');
  });

  app.post('/pieces/:id/delete', async (request, reply) => {
    const piece = await loadPiece(request.params.id);
    const result = await pieces.remove(piece.id);
    for (const imageId of result.imageIds) await deleteImageIfUnused(app, imageId);
    await recordChange(app, request, 'piece.delete', `${result.archived ? 'archived' : 'deleted'} "${piece.name}"`);
    return redirect(reply, '/admin/pieces', result.archived ? 'archived' : 'deleted');
  });

  app.post('/pieces/bulk', async (request, reply) => {
    const form = new FormReader(request.body);
    const status = BULK_ACTIONS[form.raw('action')];
    const ids = form.idList('ids');
    if (status && ids.length) {
      await pieces.setStatus(ids, status);
      await recordChange(app, request, 'piece.bulk', `set ${ids.length} pieces to ${status}`);
    }
    return redirect(reply, '/admin/pieces', 'bulk');
  });

  app.post('/pieces/:id/images', async (request, reply) => {
    const piece = await loadPiece(request.params.id);
    const files = uploadedFiles(request);
    for (const file of files) {
      const image = await storeImage(app, file.value);
      await pieces.addImage(piece.id, image.id, image.has_alpha ? 'cutout' : 'photo', piece.name);
    }
    await recordChange(app, request, 'piece.photos', `added ${files.length} photo(s) to "${piece.name}"`);
    return redirect(reply, `/admin/pieces/${piece.id}`, 'uploaded');
  });

  app.post('/pieces/:id/images/:imageId', async (request, reply) => {
    const piece = await loadPiece(request.params.id);
    const form = new FormReader(request.body);
    const role = form.oneOf('role', ['cutout', 'photo'], { label: 'Type' }) ?? 'photo';
    await pieces.updateImage(piece.id, parseId(request.params.imageId), { role, alt: form.text('alt', { label: 'Description', max: 120 }) ?? '' });
    await recordChange(app, request, 'piece.photos', `edited a photo of "${piece.name}"`);
    return redirect(reply, `/admin/pieces/${piece.id}`, 'saved');
  });

  app.post('/pieces/:id/images/:imageId/move', async (request, reply) => {
    const piece = await loadPiece(request.params.id);
    await pieces.moveImage(piece.id, parseId(request.params.imageId), parseDirection(request.body.direction));
    await recordChange(app, request, 'piece.photos', `reordered photos of "${piece.name}"`);
    return redirect(reply, `/admin/pieces/${piece.id}`, 'moved');
  });

  app.post('/pieces/:id/images/:imageId/delete', async (request, reply) => {
    const piece = await loadPiece(request.params.id);
    const imageId = parseId(request.params.imageId);
    await pieces.removeImage(piece.id, imageId);
    await deleteImageIfUnused(app, imageId);
    await recordChange(app, request, 'piece.photos', `removed a photo from "${piece.name}"`);
    return redirect(reply, `/admin/pieces/${piece.id}`, 'deleted');
  });

}
