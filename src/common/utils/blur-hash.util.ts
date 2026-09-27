import { encode } from 'blurhash';
import { readFile } from 'fs/promises';
import sharp from 'sharp';

const BLUR_COMPONENT_X = 4;
const BLUR_COMPONENT_Y = 3;
const ENCODE_SIZE = 32;

/** Build a BlurHash string from an image file on disk. */
export async function blurHashFromFile(filePath: string): Promise<string | null> {
  try {
    const { data, info } = await sharp(filePath)
      .raw()
      .ensureAlpha()
      .resize(ENCODE_SIZE, ENCODE_SIZE, { fit: 'inside' })
      .toBuffer({ resolveWithObject: true });

    return encode(
      new Uint8ClampedArray(data),
      info.width,
      info.height,
      BLUR_COMPONENT_X,
      BLUR_COMPONENT_Y,
    );
  } catch {
    return null;
  }
}

/** Build a BlurHash from image bytes (e.g. upload buffer). */
export async function blurHashFromBuffer(buffer: Buffer): Promise<string | null> {
  try {
    const { data, info } = await sharp(buffer)
      .raw()
      .ensureAlpha()
      .resize(ENCODE_SIZE, ENCODE_SIZE, { fit: 'inside' })
      .toBuffer({ resolveWithObject: true });

    return encode(
      new Uint8ClampedArray(data),
      info.width,
      info.height,
      BLUR_COMPONENT_X,
      BLUR_COMPONENT_Y,
    );
  } catch {
    return null;
  }
}

export async function blurHashFromPathOrNull(
  filePath: string | null | undefined,
): Promise<string | null> {
  if (!filePath) {
    return null;
  }
  try {
    await readFile(filePath);
  } catch {
    return null;
  }
  return blurHashFromFile(filePath);
}
