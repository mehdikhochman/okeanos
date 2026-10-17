-- Initial schema. Times are stored as ISO-8601 UTC text; money as integer cents.
-- SQLite has no boolean type: flags are 0/1 integers with CHECK constraints.

CREATE TABLE users (
  id             INTEGER PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name           TEXT NOT NULL,
  password_hash  TEXT NOT NULL,
  role           TEXT NOT NULL CHECK (role IN ('owner', 'editor')),
  failed_logins  INTEGER NOT NULL DEFAULT 0,
  locked_until   TEXT,
  last_login_at  TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE sessions (
  id_hash       TEXT PRIMARY KEY,           -- SHA-256 of the cookie value; the cookie itself is never stored
  user_id       INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  csrf_token    TEXT NOT NULL,
  created_at    INTEGER NOT NULL,           -- milliseconds since epoch, compared on every request
  last_seen_at  INTEGER NOT NULL,
  user_agent    TEXT NOT NULL DEFAULT ''
);
CREATE INDEX sessions_user ON sessions (user_id);

CREATE TABLE categories (
  id        INTEGER PRIMARY KEY,
  slug      TEXT NOT NULL UNIQUE,
  name      TEXT NOT NULL,
  position  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE collections (
  id           INTEGER PRIMARY KEY,
  slug         TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  is_visible   INTEGER NOT NULL DEFAULT 1 CHECK (is_visible IN (0, 1)),
  position     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE images (
  id          INTEGER PRIMARY KEY,
  file_key    TEXT NOT NULL UNIQUE,         -- content hash; files are <key>-480.webp and <key>-1200.webp
  width       INTEGER NOT NULL,
  height      INTEGER NOT NULL,
  has_alpha   INTEGER NOT NULL DEFAULT 0 CHECK (has_alpha IN (0, 1)),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE pieces (
  id              INTEGER PRIMARY KEY,
  slug            TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  type_label      TEXT NOT NULL,             -- shown under the name: "Earrings", "Wrist to finger"
  category_id     INTEGER NOT NULL REFERENCES categories (id),
  finish          TEXT NOT NULL DEFAULT 'gold' CHECK (finish IN ('gold', 'rose', 'silver', 'mixed')),
  accent          TEXT NOT NULL DEFAULT 'gold' CHECK (accent IN ('gold', 'enamel', 'beads', 'pearls', 'stones')),
  badge           TEXT NOT NULL DEFAULT '',  -- free text: "Best seller", "New in"
  is_new          INTEGER NOT NULL DEFAULT 0 CHECK (is_new IN (0, 1)),
  description     TEXT NOT NULL DEFAULT '',
  price_cents     INTEGER CHECK (price_cents IS NULL OR price_cents >= 0),
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  availability    TEXT NOT NULL DEFAULT 'made_to_order' CHECK (availability IN ('made_to_order', 'sold_out')),
  option_label    TEXT NOT NULL DEFAULT '',  -- "Colour", "Size"; empty when the piece has no options
  instagram_url   TEXT NOT NULL DEFAULT '',
  position        INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX pieces_status_position ON pieces (status, position);

CREATE TABLE piece_options (
  id        INTEGER PRIMARY KEY,
  piece_id  INTEGER NOT NULL REFERENCES pieces (id) ON DELETE CASCADE,
  label     TEXT NOT NULL,
  swatch    TEXT NOT NULL DEFAULT '',        -- optional colour (#hex) shown as a dot
  position  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX piece_options_piece ON piece_options (piece_id);

CREATE TABLE piece_images (
  piece_id  INTEGER NOT NULL REFERENCES pieces (id) ON DELETE CASCADE,
  image_id  INTEGER NOT NULL REFERENCES images (id) ON DELETE CASCADE,
  role      TEXT NOT NULL DEFAULT 'photo' CHECK (role IN ('cutout', 'photo')),
  alt       TEXT NOT NULL DEFAULT '',
  position  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (piece_id, image_id)
);

CREATE TABLE piece_collections (
  piece_id       INTEGER NOT NULL REFERENCES pieces (id) ON DELETE CASCADE,
  collection_id  INTEGER NOT NULL REFERENCES collections (id) ON DELETE CASCADE,
  PRIMARY KEY (piece_id, collection_id)
);

CREATE TABLE lookbook_photos (
  id          INTEGER PRIMARY KEY,
  image_id    INTEGER NOT NULL REFERENCES images (id),
  caption     TEXT NOT NULL DEFAULT '',
  is_visible  INTEGER NOT NULL DEFAULT 1 CHECK (is_visible IN (0, 1)),
  position    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE guide_entries (
  id          INTEGER PRIMARY KEY,
  question    TEXT NOT NULL,
  answer      TEXT NOT NULL,
  is_visible  INTEGER NOT NULL DEFAULT 1 CHECK (is_visible IN (0, 1)),
  position    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);

-- Orders placed on the website. Customer and delivery details are copied in at the time
-- of the order, and so are piece names and prices, so later catalogue edits never
-- rewrite history.
CREATE TABLE orders (
  id                INTEGER PRIMARY KEY,
  number            TEXT NOT NULL UNIQUE,            -- shown to the customer: OK-1001
  idempotency_key   TEXT NOT NULL UNIQUE,            -- sent by the browser so a double click places one order
  status            TEXT NOT NULL DEFAULT 'new'
                    CHECK (status IN ('new', 'confirmed', 'in_production', 'out_for_delivery', 'delivered', 'cancelled')),
  customer_name     TEXT NOT NULL,
  phone             TEXT NOT NULL,
  email             TEXT NOT NULL DEFAULT '',
  city              TEXT NOT NULL,
  address           TEXT NOT NULL,
  customer_note     TEXT NOT NULL DEFAULT '',
  latitude          REAL,
  longitude         REAL,
  location_accuracy_m INTEGER,
  currency          TEXT NOT NULL,
  subtotal_cents    INTEGER,                         -- NULL when at least one piece had no price
  delivery_cents    INTEGER,
  total_cents       INTEGER,
  item_count        INTEGER NOT NULL,
  admin_note        TEXT NOT NULL DEFAULT '',
  ip_hash           TEXT NOT NULL DEFAULT '',        -- keyed hash, for abuse checks only
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX orders_status_created ON orders (status, created_at);
CREATE INDEX orders_created ON orders (created_at);

CREATE TABLE order_items (
  id                INTEGER PRIMARY KEY,
  order_id          INTEGER NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  piece_id          INTEGER REFERENCES pieces (id) ON DELETE SET NULL,
  piece_name        TEXT NOT NULL,
  option_label      TEXT NOT NULL DEFAULT '',
  quantity          INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 20),
  unit_price_cents  INTEGER
);
CREATE INDEX order_items_order ON order_items (order_id);
CREATE INDEX order_items_piece ON order_items (piece_id);

CREATE TABLE activity_log (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER REFERENCES users (id) ON DELETE SET NULL,
  action      TEXT NOT NULL,                  -- "piece.update", "order.status"
  summary     TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX activity_log_created ON activity_log (created_at);
