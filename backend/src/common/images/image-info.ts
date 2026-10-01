import { BadRequestException } from '@nestjs/common';

export type ImageMime = 'image/png' | 'image/jpeg' | 'image/webp';

/** Gallery limits live here, in one place. */
export const GALLERY_QUOTA_BYTES = 300 * 1024 * 1024;
export const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
export const MAX_THUMB_BYTES = 300 * 1024;
export const MAX_PHOTOS_PER_UPLOAD = 10;
export const MAX_LOGO_BYTES = 512 * 1024;
export const MAX_BANNER_BYTES = 2 * 1024 * 1024;
const MAX_DIMENSION = 10_000;

/** The subset of a multer file the services use (memory storage). */
export interface StoredImageLike {
  bytes: Buffer;
  mimeType: string;
}

export interface UploadedImageFile {
  buffer: Buffer;
  size: number;
  mimetype: string;
  originalname?: string;
}

/**
 * Sniffs the real format from the bytes (the client's Content-Type is ignored)
 * and reads the pixel size from the header. Only PNG, JPEG and WebP pass.
 */
export function imageInfo(bytes: Buffer, what = 'image'): { type: ImageMime; width: number; height: number } {
  const dims = readDims(bytes);
  if (!dims) throw new BadRequestException(`The ${what} is not a valid PNG, JPEG or WebP image.`);
  if (dims.width < 1 || dims.height < 1 || dims.width > MAX_DIMENSION || dims.height > MAX_DIMENSION) {
    throw new BadRequestException(`The ${what} has unsupported dimensions.`);
  }
  return dims;
}

function readDims(b: Buffer): { type: ImageMime; width: number; height: number } | null {
  if (b.length < 24) return null;
  // PNG: signature + IHDR (width/height big-endian at 16/20).
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    if (b.subarray(12, 16).toString('ascii') !== 'IHDR') return null;
    return { type: 'image/png', width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  }
  // JPEG: walk the segments to the first SOFn frame header.
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1];
      if (marker === 0xff) { i++; continue; }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      const len = b.readUInt16BE(i + 2);
      const isSof = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
      if (isSof) return { type: 'image/jpeg', height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
      if (len < 2) return null;
      i += 2 + len;
    }
    return null;
  }
  // WebP: RIFF....WEBP + VP8 / VP8L / VP8X chunk.
  if (b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP' && b.length >= 30) {
    const chunk = b.subarray(12, 16).toString('ascii');
    if (chunk === 'VP8 ') return { type: 'image/webp', width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
    if (chunk === 'VP8L') {
      const b0 = b[21], b1 = b[22], b2 = b[23], b3 = b[24];
      return { type: 'image/webp', width: 1 + (((b1 & 0x3f) << 8) | b0), height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)) };
    }
    if (chunk === 'VP8X') return { type: 'image/webp', width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
    return null;
  }
  return null;
}
