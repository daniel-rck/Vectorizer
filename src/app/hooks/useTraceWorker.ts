/**
 * Worker-Lifecycle + Job-Superseding (Architektur §Threading):
 * Worker sind nicht unterbrechbar, daher trägt jede Trace-Anfrage eine
 * laufende Job-ID; Antworten mit veralteter ID werden verworfen.
 * Das Bild geht einmal als Transferable an den Worker, danach nur Parameter.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ResultMessage,
  TraceMessage,
  WorkerResponse,
} from "../../lib/potrace/protocol";
import type { TraceSettings } from "../types";

export interface TraceWorkerApi {
  /** Bild an den Worker übertragen (kopiert; das Original bleibt beim Canvas). */
  sendImage: (data: ImageData) => void;
  /** Trace mit den aktuellen Einstellungen anstoßen (superseded ältere Jobs). */
  trace: (settings: TraceSettings, lockedPalette?: string[]) => void;
  result: ResultMessage | null;
  error: string | null;
  /** true, solange der zuletzt angestoßene Job noch keine Antwort hat. */
  busy: boolean;
  /** Letztes Ergebnis verwerfen (z.B. bei neuem Bild). */
  clear: () => void;
  /** Nur die Fehlermeldung ausblenden. */
  clearError: () => void;
}

export function useTraceWorker(): TraceWorkerApi {
  const workerRef = useRef<Worker | null>(null);
  const jobRef = useRef(0);
  /** Letztes Bild — ein neu erzeugter Worker (nach Absturz) bekommt es erneut. */
  const imageRef = useRef<ImageData | null>(null);
  const [result, setResult] = useState<ResultMessage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const postImage = useCallback((worker: Worker, data: ImageData) => {
    const copy = new Uint8ClampedArray(data.data);
    worker.postMessage(
      { type: "image", buf: copy.buffer, w: data.width, h: data.height },
      [copy.buffer],
    );
  }, []);

  const ensureWorker = useCallback((): Worker => {
    if (workerRef.current) return workerRef.current;
    const worker = new Worker(new URL("../../worker/trace.worker.ts", import.meta.url), {
      type: "module",
    });
    // Absturz (z.B. Speicher): Busy lösen, Worker verwerfen — der nächste
    // Trace erzeugt einen frischen Worker und schickt das Bild erneut.
    const fail = (message: string): void => {
      worker.terminate();
      if (workerRef.current === worker) workerRef.current = null;
      setBusy(false);
      setError(message);
    };
    worker.onerror = (ev) => {
      ev.preventDefault();
      fail(ev.message || "Trace-Worker abgestürzt");
    };
    worker.onmessageerror = () => fail("Worker-Nachricht unlesbar");
    worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const msg = ev.data;
      if (msg.type === "ready") return;
      if (msg.job !== jobRef.current) return; // veraltete Antwort verwerfen
      setBusy(false);
      if (msg.type === "error") setError(msg.message);
      else {
        setError(null);
        setResult(msg);
      }
    };
    workerRef.current = worker;
    if (imageRef.current) postImage(worker, imageRef.current);
    return worker;
  }, [postImage]);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const sendImage = useCallback(
    (data: ImageData) => {
      const fresh = !workerRef.current;
      imageRef.current = data;
      const worker = ensureWorker();
      // Frischer Worker hat das Bild bereits in ensureWorker bekommen
      if (!fresh) postImage(worker, data);
    },
    [ensureWorker, postImage],
  );

  const trace = useCallback(
    (settings: TraceSettings, lockedPalette?: string[]) => {
      const job = ++jobRef.current;
      const msg: TraceMessage = {
        type: "trace",
        job,
        colorMode: settings.colorMode,
        paletteSize: settings.paletteSize,
        params: settings.params,
        fill: settings.fill,
        despeckle: settings.despeckle,
        autoThreshold: settings.autoThreshold,
        threshold: settings.threshold,
        invert: settings.invert,
        ...(lockedPalette ? { lockedPalette } : {}),
      };
      setBusy(true);
      ensureWorker().postMessage(msg);
    },
    [ensureWorker],
  );

  const clear = useCallback(() => {
    jobRef.current++;
    setResult(null);
    setError(null);
    setBusy(false);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { sendImage, trace, result, error, busy, clear, clearError };
}
