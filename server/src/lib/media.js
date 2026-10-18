// Stores uploaded images. Every upload is decoded and re-encoded by sharp, which
// strips EXIF/GPS data and makes sure the file really is an image, then saved as
// WebP in two widths under a content-hash name (so URLs can be cached forever).
//
// Two places to keep the files:
//   local - the DATA_DIR/media folder, served by this app at /media (development, VPS)
//   blob  - Vercel Blob, served from Vercel's CDN (Vercel deployments, whose disk is temporary)
import fs from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { put, del } from '@vercel/blob';
import { sha256 } from './crypto.js';
import { badRequest } from './http-error.js';

export const IMAGE_WIDTHS = [480, 1200];
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'];
export const LOCAL_BASE_URL = '/media';
const MAX_INPUT_PIXELS = 50_000_000;
const FILE_KEY_LENGTH = 20;
const fileName = (fileKey, width) => `${fileKey}-${width}.webp`;

export function mediaUrl(image, width) {
  return `${image.base_url ?? LOCAL_BASE_URL}/${fileName(image.file_key, width)}`;
}

async function encode(buffer) {
  let metadata;
  let isOpaque;
  try {
    const input = sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' });
    [metadata, { isOpaque }] = await Promise.all([input.metadata(), input.stats()]);
  } catch {
    throw badRequest('This file could not be read as an image. Use a JPEG, PNG or WebP photo.');
  }
  const versions = await Promise.all(IMAGE_WIDTHS.map(async (width) => {
    const { data, info } = await sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate() // apply the phone's orientation flag before it is stripped
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 80, alphaQuality: 90, effort: 4 })
      .toBuffer({ resolveWithObject: true });
    return { width, data, info };
  }));
  const largest = versions.at(-1).info;
  return {
    fileKey: sha256(buffer).slice(0, FILE_KEY_LENGTH),
    width: largest.width ?? metadata.width,
    height: largest.height ?? metadata.height,
    hasAlpha: !isOpaque,
    versions,
  };
}

function localStore(mediaDir) {
  mkdirSync(mediaDir, { recursive: true });
  return {
    dir: mediaDir,
    async save(buffer) {
      const { versions, ...image } = await encode(buffer);
      await Promise.all(versions.map((v) => fs.writeFile(path.join(mediaDir, fileName(image.fileKey, v.width)), v.data)));
      return { ...image, baseUrl: LOCAL_BASE_URL };
    },
    async remove(image) {
      await Promise.all(IMAGE_WIDTHS.map((width) => fs.rm(path.join(mediaDir, fileName(image.file_key, width)), { force: true })));
    },
  };
}

function blobStore(token) {
  return {
    dir: null,
    async save(buffer) {
      const { versions, ...image } = await encode(buffer);
      const uploads = await Promise.all(versions.map((v) => put(`media/${fileName(image.fileKey, v.width)}`, v.data, {
        access: 'public',
        token, // undefined means: sign in with BLOB_STORE_ID and Vercel's OIDC token
        contentType: 'image/webp',
        addRandomSuffix: false, // the name is already a content hash
        allowOverwrite: true,
        cacheControlMaxAge: 365 * 24 * 60 * 60,
      })));
      const baseUrl = uploads[0].url.slice(0, uploads[0].url.lastIndexOf('/'));
      return { ...image, baseUrl };
    },
    async remove(image) {
      await del(IMAGE_WIDTHS.map((width) => mediaUrl(image, width)), { token });
    },
  };
}

export function createMediaStore({ driver, mediaDir, blobToken }) {
  return driver === 'blob' ? blobStore(blobToken) : localStore(mediaDir);
}
