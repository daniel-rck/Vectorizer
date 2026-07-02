/**
 * Session-Persistenz in IndexedDB (idb): letztes Bild + Parameter,
 * Wiederherstellen beim Start.
 */

import { openDB, type IDBPDatabase } from "idb";
import type { DisplaySettings, TraceSettings } from "../types";

const DB_NAME = "vektor";
const STORE = "session";
const KEY = "current";

export interface PersistedSession {
  /** RGBA-Bytes des zuletzt geladenen Bilds. */
  buf: ArrayBuffer;
  w: number;
  h: number;
  scaled: boolean;
  settings: TraceSettings;
  display: DisplaySettings;
}

function db(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, 1, {
    upgrade(d) {
      d.createObjectStore(STORE);
    },
  });
}

export async function saveSession(s: PersistedSession): Promise<void> {
  try {
    await (await db()).put(STORE, s, KEY);
  } catch {
    // Speicher voll / privater Modus: Persistenz ist optional
  }
}

export async function loadSession(): Promise<PersistedSession | null> {
  try {
    const v = (await (await db()).get(STORE, KEY)) as PersistedSession | undefined;
    if (!v?.buf || !v.w || !v.h) return null;
    return v;
  } catch {
    return null;
  }
}
