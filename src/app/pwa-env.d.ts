/// <reference types="vite-plugin-pwa/client" />

/** File Handling API (Chromium) — noch nicht in lib.dom. */
interface LaunchParams {
  readonly files: readonly FileSystemFileHandle[];
}

interface LaunchQueue {
  setConsumer(consumer: (params: LaunchParams) => void): void;
}

interface Window {
  readonly launchQueue?: LaunchQueue;
}
