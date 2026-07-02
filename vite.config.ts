import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // injectManifest: eigener Service Worker nötig, weil das Share Target
      // (POST /share-target) im SW beantwortet werden muss.
      strategies: "injectManifest",
      srcDir: "src/pwa",
      filename: "sw.ts",
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      injectManifest: {
        // Fonts und Icons mit precachen (Default wäre nur js/css/html)
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
      },
      manifest: {
        name: "vektor — Raster zu SVG",
        short_name: "vektor",
        description:
          "Potrace-Vektorisierer: PNG/JPG/WEBP zu SVG, vollständig im Browser.",
        lang: "de",
        start_url: "/",
        display: "standalone",
        background_color: "#0f1115",
        theme_color: "#0f1115",
        icons: [
          { src: "/pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/pwa-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
        // Android: Bild aus anderer App direkt an vektor teilen
        share_target: {
          action: "/share-target",
          method: "POST",
          enctype: "multipart/form-data",
          params: {
            files: [
              {
                name: "image",
                accept: ["image/png", "image/jpeg", "image/webp"],
              },
            ],
          },
        },
        // "Öffnen mit" für Bilddateien
        file_handlers: [
          {
            action: "/",
            accept: {
              "image/png": [".png"],
              "image/jpeg": [".jpg", ".jpeg"],
              "image/webp": [".webp"],
            },
          },
        ],
      } as Record<string, unknown>,
    }),
  ],
});
