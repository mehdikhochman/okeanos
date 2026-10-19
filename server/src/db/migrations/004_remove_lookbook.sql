-- The shop no longer has a lookbook. Its photos stay in the images table and in storage,
-- so nothing a piece uses can be lost.
DROP TABLE IF EXISTS lookbook_photos;
UPDATE settings SET value = CAST(value AS INTEGER) + 1 WHERE key = 'catalogue_version';
