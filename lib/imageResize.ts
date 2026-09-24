/**
 * Shrinking images in the browser before they are uploaded.
 *
 * Uploads go straight from the browser to blob storage, so the server never
 * sees the file and cannot resize it. Doing the work here is not a
 * workaround, it is the only place available — and it is the better place
 * anyway, since a 3 MB phone photo never has to cross the network at all.
 *
 * This matters more for bandwidth than for storage. The stored file is the
 * file that gets served, and the same multi-megabyte original was being
 * sent to render a 36-pixel avatar on a collection card, every time, for
 * every visitor. A store holding 80 MB of unresized originals will exhaust
 * a 10 GB monthly transfer allowance in a few hundred page views.
 *
 * Deliberately conservative about what it touches:
 *
 *   - Animated GIFs are left alone. A canvas keeps one frame, so
 *     "optimising" one would silently destroy the animation.
 *   - Video and audio are left alone; a canvas cannot re-encode them.
 *   - Anything that comes out larger than it went in is discarded in
 *     favour of the original, which happens with small or already
 *     optimised files.
 *   - The result is only used if the encoder actually produced the format
 *     asked for, so a browser without WebP support falls back rather than
 *     writing a JPEG that has quietly flattened a transparent background.
 */
export interface ShrinkOptions {
  /**
   * Longest edge allowed, in pixels. Images already smaller are never
   * scaled up — they may still be re-encoded, which is usually where most
   * of the saving is for a screenshot or an AI render.
   */
  maxDimension: number;
  /** WebP quality, 0–1. */
  quality?: number;
}

export interface ShrinkResult {
  file: File;
  originalBytes: number;
  /** Zero when the original was kept. */
  savedBytes: number;
}

/** Formats a canvas can safely re-encode without losing something. */
const RESIZABLE = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

function unchanged(file: File): ShrinkResult {
  return { file, originalBytes: file.size, savedBytes: 0 };
}

async function toBlob(
  canvas: OffscreenCanvas | HTMLCanvasElement,
  quality: number
): Promise<Blob | null> {
  if (canvas instanceof OffscreenCanvas) {
    return canvas.convertToBlob({ type: "image/webp", quality });
  }
  return new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));
}

export async function shrinkImage(file: File, options: ShrinkOptions): Promise<ShrinkResult> {
  const { maxDimension, quality = 0.85 } = options;
  if (maxDimension <= 0) return unchanged(file);
  if (!RESIZABLE.has(file.type)) return unchanged(file);
  if (typeof createImageBitmap !== "function") return unchanged(file);

  let bitmap: ImageBitmap;
  try {
    // `from-image` applies the EXIF orientation. Without it, photos taken
    // in portrait on a phone are re-encoded sideways — the rotation lives
    // in metadata that decoding to a canvas otherwise throws away.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // A corrupt or unsupported image is not worth failing an upload over.
    return unchanged(file);
  }

  try {
    const longest = Math.max(bitmap.width, bitmap.height);
    const scale = Math.min(1, maxDimension / longest);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas =
      typeof OffscreenCanvas === "function"
        ? new OffscreenCanvas(width, height)
        : Object.assign(document.createElement("canvas"), { width, height });

    const context = canvas.getContext("2d") as
      | OffscreenCanvasRenderingContext2D
      | CanvasRenderingContext2D
      | null;
    if (!context) return unchanged(file);
    context.drawImage(bitmap, 0, 0, width, height);

    const blob = await toBlob(canvas, quality);
    // A browser that cannot encode WebP hands back a PNG, or null. Either
    // way the transparency-safe answer is to keep what we were given.
    if (!blob || blob.type !== "image/webp") return unchanged(file);
    if (blob.size >= file.size) return unchanged(file);

    const name = file.name.replace(/\.[^.]+$/, "") + ".webp";
    return {
      file: new File([blob], name, { type: "image/webp", lastModified: Date.now() }),
      originalBytes: file.size,
      savedBytes: file.size - blob.size,
    };
  } catch {
    return unchanged(file);
  } finally {
    bitmap.close();
  }
}

/**
 * Longest-edge budgets per kind of image.
 *
 * Artwork is the product and stays generous; a logo rendered at 36 pixels
 * on a card has no use for 4000. ID documents are exempt entirely — they
 * are read by a human checking a name against a face, and compression
 * artefacts on a document number are the one place saving bytes is not
 * worth it.
 */
export const IMAGE_BUDGETS = {
  artwork: { maxDimension: 2048, quality: 0.86 },
  banner: { maxDimension: 2400, quality: 0.82 },
  logo: { maxDimension: 800, quality: 0.85 },
  avatar: { maxDimension: 800, quality: 0.85 },
  idDocument: { maxDimension: 0 },
} as const satisfies Record<string, ShrinkOptions>;

export type ImageBudget = keyof typeof IMAGE_BUDGETS;

/** "3.2 MB → 480 KB", for telling someone what just happened. */
export function describeSaving(result: ShrinkResult): string | null {
  if (result.savedBytes <= 0) return null;
  const size = (bytes: number) =>
    bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
  const percent = Math.round((result.savedBytes / result.originalBytes) * 100);
  return `${size(result.originalBytes)} → ${size(result.file.size)} (${percent}% smaller)`;
}
