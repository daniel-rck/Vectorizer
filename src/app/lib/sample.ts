/**
 * Beispielbild wie im Prototyp: warmer Hintergrund, vier flächige Farben
 * plus dunkles Ampersand — idealer Farb-Trace-Fall.
 */

export function makeSampleImage(): ImageData {
  const w = 440;
  const h = 300;
  const canvas = new OffscreenCanvas(w, h);
  const x = canvas.getContext("2d");
  if (!x) throw new Error("2D-Kontext nicht verfügbar");
  x.fillStyle = "#F4EFE6";
  x.fillRect(0, 0, w, h);
  x.fillStyle = "#2E86AB";
  x.beginPath();
  x.arc(150, 150, 95, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = "#E8A04C";
  x.beginPath();
  x.arc(150, 150, 48, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = "#C0392B";
  x.beginPath();
  x.moveTo(300, 60);
  x.lineTo(410, 60);
  x.lineTo(355, 170);
  x.closePath();
  x.fill();
  x.fillStyle = "#27AE60";
  x.fillRect(285, 185, 130, 80);
  x.fillStyle = "#1B2A33";
  x.font = "700 150px Georgia, 'Times New Roman', serif";
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.fillText("&", 355, 120);
  return x.getImageData(0, 0, w, h);
}
