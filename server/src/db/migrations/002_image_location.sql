-- Images can live in the local media folder ('/media') or in Vercel Blob (its public URL prefix).
ALTER TABLE images ADD COLUMN base_url TEXT NOT NULL DEFAULT '/media';
