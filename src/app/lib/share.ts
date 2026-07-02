/** Gegenstück zum Share-Target im Service Worker (src/pwa/sw.ts). */

const SHARE_CACHE = "share-target";
const SHARE_KEY = "/shared-image";

/** Geteiltes Bild abholen und aus dem Cache entfernen. */
export async function takeSharedImage(): Promise<Blob | null> {
  if (typeof caches === "undefined") return null;
  try {
    const cache = await caches.open(SHARE_CACHE);
    const resp = await cache.match(SHARE_KEY);
    if (!resp) return null;
    await cache.delete(SHARE_KEY);
    return await resp.blob();
  } catch {
    return null;
  }
}
