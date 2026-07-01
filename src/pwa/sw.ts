/// <reference lib="webworker" />
/**
 * Service Worker: Workbox-Precache (offline) + Share-Target-Intake.
 * Ein per Android-Share geteiltes Bild wird im Cache zwischengelagert;
 * die App holt es beim Start über /?shared=1 wieder ab (lib/share.ts).
 */

import { clientsClaim } from "workbox-core";
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Parameters<typeof precacheAndRoute>[0];
};

clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
registerRoute(new NavigationRoute(createHandlerBoundToURL("index.html")));

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") void self.skipWaiting();
});

export const SHARE_CACHE = "share-target";
export const SHARE_KEY = "/shared-image";

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method === "POST" && url.pathname === "/share-target") {
    event.respondWith(
      (async () => {
        try {
          const form = await event.request.formData();
          const file = form.get("image");
          if (file instanceof File) {
            const cache = await caches.open(SHARE_CACHE);
            await cache.put(
              SHARE_KEY,
              new Response(file, { headers: { "Content-Type": file.type } }),
            );
          }
        } catch {
          // fehlerhafte Form-Daten: einfach zur App weiterleiten
        }
        return Response.redirect("/?shared=1", 303);
      })(),
    );
  }
});
