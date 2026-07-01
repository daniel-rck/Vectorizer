/**
 * Bildaufnahme: Datei/Blob dekodieren und auf die maximale Kantenlänge
 * herunterskalieren (createImageBitmap + OffscreenCanvas, kein <img>-Umweg).
 */

export const MAX_SIDE = 1600;

export interface DecodedImage {
  data: ImageData;
  scaled: boolean;
}

export async function decodeImage(blob: Blob): Promise<DecodedImage> {
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D-Kontext nicht verfügbar");
    ctx.drawImage(bitmap, 0, 0, w, h);
    return { data: ctx.getImageData(0, 0, w, h), scaled: scale < 1 };
  } finally {
    bitmap.close();
  }
}
