// Categories, collections, lookbook photos and guide entries.
import { FormReader, slugify } from '../../lib/form.js';
import { notFound } from '../../lib/http-error.js';
import { categoriesPage, collectionsPage, guidePage, lookbookPage } from '../../admin-ui/views/catalogue.js';
import {
  deleteImageIfUnused, pageContext, parseDirection, parseId, recordChange, redirect, sendPage, storeImage, uploadedFiles,
} from './helpers.js';

function loadOr404(repository, id, what) {
  const row = repository.get(parseId(id));
  if (!row) throw notFound(what);
  return row;
}

function uniqueSlug(repository, name, exceptId) {
  const base = slugify(name);
  let slug = base;
  for (let n = 2; repository.isSlugTaken(slug, exceptId); n += 1) slug = `${base}-${n}`;
  return slug;
}

function categoryRoutes(app) {
  const { categories } = app.repos;
  const page = (request, reply, extra = {}, statusCode = 200) =>
    sendPage(reply, categoriesPage({ ctx: pageContext(app, request), categories: categories.list(), ...extra }), statusCode);

  app.get('/categories', async (request, reply) => page(request, reply));

  app.post('/categories', async (request, reply) => {
    const form = new FormReader(request.body);
    const name = form.text('name', { label: 'Name', required: true, max: 40 });
    if (form.hasErrors) return page(request, reply, { errors: form.errors, values: form.body }, 400);
    categories.create({ name, slug: uniqueSlug(categories, name, 0) });
    recordChange(app, request, 'category.create', `added the category "${name}"`);
    return redirect(reply, '/admin/categories', 'created');
  });

  app.post('/categories/:id', async (request, reply) => {
    const category = loadOr404(categories, request.params.id, 'Category');
    const form = new FormReader(request.body);
    const name = form.text('name', { label: 'Name', required: true, max: 40 });
    if (form.hasErrors) return page(request, reply, { errors: form.errors }, 400);
    categories.update(category.id, { name, slug: uniqueSlug(categories, name, category.id) });
    recordChange(app, request, 'category.update', `renamed the category "${category.name}" to "${name}"`);
    return redirect(reply, '/admin/categories', 'saved');
  });

  app.post('/categories/:id/move', async (request, reply) => {
    const category = loadOr404(categories, request.params.id, 'Category');
    categories.move(category.id, parseDirection(request.body.direction));
    recordChange(app, request, 'category.move', `moved the category "${category.name}"`);
    return redirect(reply, '/admin/categories', 'moved');
  });

  app.post('/categories/:id/delete', async (request, reply) => {
    const category = loadOr404(categories, request.params.id, 'Category');
    if (categories.pieceCount(category.id) > 0) return redirect(reply, '/admin/categories', 'in-use');
    categories.remove(category.id);
    recordChange(app, request, 'category.delete', `deleted the category "${category.name}"`);
    return redirect(reply, '/admin/categories', 'deleted');
  });
}

function collectionRoutes(app) {
  const { collections } = app.repos;
  const page = (request, reply, extra = {}, statusCode = 200) =>
    sendPage(reply, collectionsPage({ ctx: pageContext(app, request), collections: collections.list(), ...extra }), statusCode);

  function read(body) {
    const form = new FormReader(body);
    const values = {
      name: form.text('name', { label: 'Name', required: true, max: 40 }),
      description: form.text('description', { label: 'Description', max: 200 }) ?? '',
      isVisible: form.checkbox('is_visible'),
    };
    return { form, values };
  }

  app.get('/collections', async (request, reply) => page(request, reply));

  app.post('/collections', async (request, reply) => {
    const { form, values } = read(request.body);
    if (form.hasErrors) return page(request, reply, { errors: form.errors, values: form.body }, 400);
    collections.create({ ...values, isVisible: true, slug: uniqueSlug(collections, values.name, 0) });
    recordChange(app, request, 'collection.create', `added the collection "${values.name}"`);
    return redirect(reply, '/admin/collections', 'created');
  });

  app.post('/collections/:id', async (request, reply) => {
    const collection = loadOr404(collections, request.params.id, 'Collection');
    const { form, values } = read(request.body);
    if (form.hasErrors) return page(request, reply, { errors: form.errors }, 400);
    collections.update(collection.id, { ...values, slug: uniqueSlug(collections, values.name, collection.id) });
    recordChange(app, request, 'collection.update', `edited the collection "${values.name}"`);
    return redirect(reply, '/admin/collections', 'saved');
  });

  app.post('/collections/:id/move', async (request, reply) => {
    const collection = loadOr404(collections, request.params.id, 'Collection');
    collections.move(collection.id, parseDirection(request.body.direction));
    recordChange(app, request, 'collection.move', `moved the collection "${collection.name}"`);
    return redirect(reply, '/admin/collections', 'moved');
  });

  app.post('/collections/:id/delete', async (request, reply) => {
    const collection = loadOr404(collections, request.params.id, 'Collection');
    collections.remove(collection.id);
    recordChange(app, request, 'collection.delete', `deleted the collection "${collection.name}"`);
    return redirect(reply, '/admin/collections', 'deleted');
  });
}

function lookbookRoutes(app) {
  const { lookbook } = app.repos;

  app.get('/lookbook', async (request, reply) =>
    sendPage(reply, lookbookPage({ ctx: pageContext(app, request), photos: lookbook.list() })));

  app.post('/lookbook', async (request, reply) => {
    const files = uploadedFiles(request);
    for (const file of files) {
      const image = await storeImage(app, file.value);
      lookbook.create(image.id, '');
    }
    recordChange(app, request, 'lookbook.upload', `added ${files.length} lookbook photo(s)`);
    return redirect(reply, '/admin/lookbook', 'uploaded');
  });

  app.post('/lookbook/:id', async (request, reply) => {
    const photo = loadOr404(lookbook, request.params.id, 'Photo');
    const form = new FormReader(request.body);
    lookbook.update(photo.id, { caption: form.text('caption', { label: 'Caption', max: 120 }) ?? '', isVisible: form.checkbox('is_visible') });
    recordChange(app, request, 'lookbook.update', 'edited a lookbook photo');
    return redirect(reply, '/admin/lookbook', 'saved');
  });

  app.post('/lookbook/:id/move', async (request, reply) => {
    const photo = loadOr404(lookbook, request.params.id, 'Photo');
    lookbook.move(photo.id, parseDirection(request.body.direction));
    recordChange(app, request, 'lookbook.move', 'reordered the lookbook');
    return redirect(reply, '/admin/lookbook', 'moved');
  });

  app.post('/lookbook/:id/delete', async (request, reply) => {
    const photo = loadOr404(lookbook, request.params.id, 'Photo');
    lookbook.remove(photo.id);
    await deleteImageIfUnused(app, photo.image_id);
    recordChange(app, request, 'lookbook.delete', 'deleted a lookbook photo');
    return redirect(reply, '/admin/lookbook', 'deleted');
  });
}

function guideRoutes(app) {
  const { guide } = app.repos;
  const page = (request, reply, extra = {}, statusCode = 200) =>
    sendPage(reply, guidePage({ ctx: pageContext(app, request), entries: guide.list(), ...extra }), statusCode);

  function read(body) {
    const form = new FormReader(body);
    const values = {
      question: form.text('question', { label: 'Question', required: true, max: 140 }),
      answer: form.text('answer', { label: 'Answer', required: true, max: 1500 }),
      isVisible: form.checkbox('is_visible'),
    };
    return { form, values };
  }

  app.get('/guide', async (request, reply) => page(request, reply));

  app.post('/guide', async (request, reply) => {
    const { form, values } = read(request.body);
    if (form.hasErrors) return page(request, reply, { errors: form.errors, values: form.body }, 400);
    guide.create({ ...values, isVisible: true });
    recordChange(app, request, 'guide.create', `added the question "${values.question}"`);
    return redirect(reply, '/admin/guide', 'created');
  });

  app.post('/guide/:id', async (request, reply) => {
    const entry = loadOr404(guide, request.params.id, 'Question');
    const { form, values } = read(request.body);
    if (form.hasErrors) return page(request, reply, { errors: form.errors }, 400);
    guide.update(entry.id, values);
    recordChange(app, request, 'guide.update', `edited the question "${values.question}"`);
    return redirect(reply, '/admin/guide', 'saved');
  });

  app.post('/guide/:id/move', async (request, reply) => {
    const entry = loadOr404(guide, request.params.id, 'Question');
    guide.move(entry.id, parseDirection(request.body.direction));
    recordChange(app, request, 'guide.move', 'reordered the guide');
    return redirect(reply, '/admin/guide', 'moved');
  });

  app.post('/guide/:id/delete', async (request, reply) => {
    const entry = loadOr404(guide, request.params.id, 'Question');
    guide.remove(entry.id);
    recordChange(app, request, 'guide.delete', `deleted the question "${entry.question}"`);
    return redirect(reply, '/admin/guide', 'deleted');
  });
}

export async function catalogueRoutes(app) {
  categoryRoutes(app);
  collectionRoutes(app);
  lookbookRoutes(app);
  guideRoutes(app);
}
