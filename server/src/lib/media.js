// Stores uploaded images. Every upload is decoded and re-encoded by sharp, which
// strips EXIF/GPS data and makes sure the file really is an image, then saved as
// WebP in two widths under a content-hash name (so URLs can be cached forever).
import fs from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { sha256 } from './crypto.js';
import { badRequest } from './http-error.js';

export const IMAGE_WIDTHS = [480, 1200];
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'];
const MAX_INPUT_PIXELS = 50_000_000;
const FILE_KEY_LENGTH = 20;

export function createMediaStore(mediaDir) {
  mkdirSync(mediaDir, { recursive: true });

  const fileFor = (fileKey, width) => path.join(mediaDir, `${fileKey}-${width}.webp`);

  async function readMetadata(buffer) {
    try {
      const input = sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' });
      const [metadata, stats] = await Promise.all([input.metadata(), input.stats()]);
      return { metadata, isOpaque: stats.isOpaque };
    } catch {
      throw badRequest('This file could not be read as an image. Use a JPEG, PNG or WebP photo.');
    }
  }

  return {
    dir: mediaDir,

    async save(buffer) {
      const { metadata, isOpaque } = await readMetadata(buffer);
      const fileKey = sha256(buffer).slice(0, FILE_KEY_LENGTH);
      let largest = { width: metadata.width, height: metadata.height };

      for (const width of IMAGE_WIDTHS) {
        const info = await sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS })
          .rotate() // apply the phone's orientation flag before it is stripped
          .resize({ width, withoutEnlargement: true })
          .webp({ quality: 80, alphaQuality: 90, effort: 4 })
          .toFile(fileFor(fileKey, width));
        largest = { width: info.width, height: info.height };
      }
      return { fileKey, ...largest, hasAlpha: !isOpaque };
    },

    async remove(fileKey) {
      await Promise.all(IMAGE_WIDTHS.map((width) => fs.rm(fileFor(fileKey, width), { force: true })));
    },
  };
}

export function mediaUrl(fileKey, width) {
  return `/media/${fileKey}-${width}.webp`;
}
