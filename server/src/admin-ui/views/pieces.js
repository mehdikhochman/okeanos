import { html } from '../../lib/html.js';
import { centsToInput, formatMoney } from '../../lib/format.js';
import { mediaUrl } from '../../lib/media.js';
import { FINISHES, ACCENTS } from '../../repositories/pieces.js';
import { layout } from '../layout.js';
import {
  actionButton, checkbox, csrfField, emptyState, errorSummary, input, piecePill, select, textarea,
} from '../components.js';

const FINISH_LABELS = { gold: 'Gold', rose: 'Rose gold', silver: 'Silver', mixed: 'Mixed' };
const ACCENT_LABELS = { gold: 'All metal', enamel: 'Enamel', beads: 'Beads', pearls: 'Pearls', stones: 'Stones' };

export function piecesListPage({ ctx, pieces, categories, filters, currency }) {
  const csrf = ctx.admin.csrf_token;
  return layout({
    ctx, title: 'Pieces', active: 'pieces',
    actions: html`<a class="button" href="/admin/pieces/new">Add a piece</a>`,
    body: html`
      <form class="search" method="get" action="/admin/pieces" role="search">
        <label class="visually-hidden" for="piece-search">Search pieces</label>
        <input id="piece-search" name="q" type="search" value="${filters.q}" placeholder="Search by name">
        <select name="status" aria-label="Status">
          ${[['', 'Live and drafts'], ['published', 'Live'], ['draft', 'Drafts'], ['archived', 'Archived']].map(([value, label]) =>
            html`<option value="${value}" ${filters.status === value ? 'selected' : ''}>${label}</option>`)}
        </select>
        <select name="category" aria-label="Category">
          <option value="">All categories</option>
          ${categories.map((c) => html`<option value="${c.id}" ${String(filters.categoryId) === String(c.id) ? 'selected' : ''}>${c.name}</option>`)}
        </select>
        <button class="button secondary" type="submit">Filter</button>
      </form>
      ${pieces.length ? html`<form method="post" action="/admin/pieces/bulk" data-bulk>
        ${csrfField(csrf)}
        <div class="bulk-bar">
          <label><input type="checkbox" data-select-all> Select all</label>
          <select name="action" aria-label="Action for selected pieces">
            <option value="publish">Put live</option>
            <option value="draft">Move to drafts</option>
            <option value="archive">Archive</option>
          </select>
          <button class="button secondary" type="submit">Apply to selected</button>
        </div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th class="check"><span class="visually-hidden">Select</span></th><th>Piece</th><th>Category</th><th class="num">Price</th><th>Status</th><th>Order</th></tr></thead>
          <tbody>${pieces.map((piece) => html`<tr>
            <td class="check"><input type="checkbox" name="ids" value="${piece.id}" aria-label="Select ${piece.name}"></td>
            <td class="piece-cell">
              ${piece.thumb_key ? html`<img src="${mediaUrl({ file_key: piece.thumb_key, base_url: piece.thumb_base }, 480)}" alt="" width="48" height="48" loading="lazy">` : html`<span class="no-thumb"></span>`}
              <a href="/admin/pieces/${piece.id}"><b>${piece.name}</b></a>
              ${piece.badge ? html`<span class="tag">${piece.badge}</span>` : ''}
              ${piece.availability === 'sold_out' ? html`<span class="tag">Sold out</span>` : ''}
            </td>
            <td>${piece.category_name}</td>
            <td class="num">${piece.price_cents === null ? html`<span class="muted">On request</span>` : formatMoney(piece.price_cents, currency)}</td>
            <td>${piecePill(piece.status)}</td>
            <td class="move">
              <button class="icon-button" type="submit" formaction="/admin/pieces/${piece.id}/move?direction=up" aria-label="Move ${piece.name} up">↑</button>
              <button class="icon-button" type="submit" formaction="/admin/pieces/${piece.id}/move?direction=down" aria-label="Move ${piece.name} down">↓</button>
            </td></tr>`)}
          </tbody></table></div>
        <p class="help">The order here is the order in the shop's "Featured" view.</p>
      </form>` : emptyState('No pieces match this filter.', html`<a class="button" href="/admin/pieces/new">Add a piece</a>`)}`,
  });
}

function optionsText(options) {
  return options.map((option) => (option.swatch ? `${option.label}, ${option.swatch}` : option.label)).join('\n');
}

function pieceFields({ piece, categories, collections, errors, isNew }) {
  return html`
    ${errorSummary(errors)}
    <div class="form-grid">
      <fieldset class="panel">
        <legend>Shown in the shop</legend>
        ${input({ name: 'name', label: 'Name', value: piece.name, required: true, max: 80, error: errors.name })}
        ${input({ name: 'type_label', label: 'Line under the name', value: piece.type_label, required: true, max: 40,
          help: 'For example "Earrings" or "Wrist to finger".', error: errors.type_label })}
        ${textarea({ name: 'description', label: 'Description', value: piece.description, max: 600, rows: 4, error: errors.description })}
        ${input({ name: 'price', label: 'Price', value: centsToInput(piece.price_cents), optional: true, error: errors.price,
          help: 'Leave empty to show "Price on request".', attrs: html`inputmode="decimal"` })}
        ${input({ name: 'badge', label: 'Badge', value: piece.badge, max: 24, optional: true,
          help: 'Small label on the photo, like "Best seller".', error: errors.badge })}
        ${checkbox({ name: 'is_new', label: 'Show in "New in"', checked: piece.is_new })}
      </fieldset>
      <fieldset class="panel">
        <legend>Organisation</legend>
        ${select({ name: 'status', label: 'Status', value: piece.status,
          options: [['draft', 'Draft (hidden)'], ['published', 'Live in the shop'], ['archived', 'Archived']] })}
        ${select({ name: 'availability', label: 'Availability', value: piece.availability,
          options: [['made_to_order', 'Made to order'], ['sold_out', 'Sold out (visible, cannot be ordered)']] })}
        ${select({ name: 'category_id', label: 'Category', value: piece.category_id, error: errors.category_id,
          options: categories.map((c) => [c.id, c.name]) })}
        ${select({ name: 'finish', label: 'Finish', value: piece.finish, options: FINISHES.map((f) => [f, FINISH_LABELS[f]]) })}
        ${select({ name: 'accent', label: 'Accent', value: piece.accent, options: ACCENTS.map((a) => [a, ACCENT_LABELS[a]]) })}
        ${collections.length ? html`<div class="field"><span class="label">Collections</span>
          ${collections.map((c) => html`<label class="check-line"><input type="checkbox" name="collection_ids" value="${c.id}"
            ${piece.collectionIds.includes(c.id) ? 'checked' : ''}> ${c.name}</label>`)}</div>` : ''}
        ${input({ name: 'instagram_url', label: 'Instagram post', value: piece.instagram_url, optional: true, error: errors.instagram_url,
          placeholder: 'https://www.instagram.com/p/…' })}
      </fieldset>
      <fieldset class="panel">
        <legend>Options</legend>
        ${input({ name: 'option_label', label: 'Option name', value: piece.option_label, max: 24, optional: true,
          help: 'For example "Colour" or "Size". Leave empty if the piece has no options.', error: errors.option_label })}
        ${textarea({ name: 'options', label: 'Choices', value: optionsText(piece.options), rows: 4, optional: true, error: errors.options,
          help: 'One per line. Add a colour after a comma to show a dot, for example: Pastel, #E9B8C8' })}
      </fieldset>
    </div>
    <div class="form-actions">
      <button class="button" type="submit">${isNew ? 'Create piece' : 'Save changes'}</button>
      <a href="/admin/pieces">Cancel</a>
      <span class="help">Tip: Ctrl + S (or ⌘ + S) saves.</span>
    </div>`;
}

function photoManager({ piece, csrf }) {
  return html`<section class="panel photos">
    <h2>Photos</h2>
    <p class="help">The first <b>cut-out</b> (transparent background) sits on the plaster tile with live shadows.
      Photos show on hover and in the product view. Use the arrows to change the order.</p>
    ${piece.images.length ? html`<ul class="photo-grid">${piece.images.map((image) => html`<li>
      <img src="${mediaUrl(image, 480)}" alt="" loading="lazy" class="${image.role === 'cutout' ? 'on-plaster' : ''}">
      <form method="post" action="/admin/pieces/${piece.id}/images/${image.image_id}" class="stack">
        ${csrfField(csrf)}
        <label class="visually-hidden" for="role-${image.image_id}">Type</label>
        <select id="role-${image.image_id}" name="role">
          <option value="cutout" ${image.role === 'cutout' ? 'selected' : ''}>Cut-out</option>
          <option value="photo" ${image.role === 'photo' ? 'selected' : ''}>Photo</option>
        </select>
        <label class="visually-hidden" for="alt-${image.image_id}">Description for screen readers</label>
        <input id="alt-${image.image_id}" name="alt" value="${image.alt}" maxlength="120" placeholder="Describe the photo">
        <button class="button secondary small" type="submit">Save</button>
      </form>
      <div class="photo-actions">
        ${actionButton({ action: `/admin/pieces/${piece.id}/images/${image.image_id}/move`, csrf, label: '←', hidden: { direction: 'up' }, className: 'icon-button' })}
        ${actionButton({ action: `/admin/pieces/${piece.id}/images/${image.image_id}/move`, csrf, label: '→', hidden: { direction: 'down' }, className: 'icon-button' })}
        ${actionButton({ action: `/admin/pieces/${piece.id}/images/${image.image_id}/delete`, csrf, label: 'Remove', className: 'link-button danger', confirm: 'Remove this photo from the piece?' })}
      </div></li>`)}</ul>` : html`<p class="muted">No photos yet.</p>`}
    <form method="post" action="/admin/pieces/${piece.id}/images" enctype="multipart/form-data" class="upload" data-upload>
      ${csrfField(csrf)}
      <label for="f-photos" class="label">Add photos</label>
      <input id="f-photos" name="photos" type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple required>
      <p class="help">JPEG, PNG or WebP. Large photos are resized before upload. PNGs with a transparent background become cut-outs automatically.</p>
      <button class="button secondary" type="submit">Upload</button>
      <p class="help" data-upload-status role="status"></p>
    </form>
  </section>`;
}

export function pieceFormPage({ ctx, piece, categories, collections, errors = {}, isNew }) {
  const csrf = ctx.admin.csrf_token;
  const action = isNew ? '/admin/pieces' : `/admin/pieces/${piece.id}`;
  return layout({
    ctx, title: isNew ? 'Add a piece' : piece.name, active: 'pieces',
    actions: isNew ? '' : html`
      ${piece.status === 'published' ? html`<a class="button secondary" href="/" target="_blank" rel="noopener">See in shop</a>` : ''}
      ${actionButton({ action: `/admin/pieces/${piece.id}/duplicate`, csrf, label: 'Duplicate', className: 'button secondary' })}
      ${actionButton({ action: `/admin/pieces/${piece.id}/delete`, csrf, label: 'Delete', className: 'button danger',
        confirm: `Delete "${piece.name}"? Pieces that were ordered before are archived instead.` })}`,
    body: html`
      <form method="post" action="${action}" data-dirty-check data-hotkey-save>
        ${csrfField(csrf)}
        ${pieceFields({ piece, categories, collections, errors, isNew })}
      </form>
      ${isNew ? html`<p class="help">You can add photos after creating the piece.</p>` : photoManager({ piece, csrf })}`,
  });
}
