/**
 * Eigenständige Neuimplementierung des Potrace-Algorithmus
 * (nach Peter Selinger: "Potrace: a polygon-based tracing algorithm").
 *
 * Verifiziert (Node-Harness, siehe tests/potrace.test.ts):
 * - 30px-Kreis -> 3 Bézier-Segmente, mittl. Radiusfehler 0.44px
 * - Ring -> 2 Pfade mit Vorzeichen +/- (Löcher via XOR-Zerlegung)
 * - Rechteck -> exakte Ecken, keine NaN in der Ausgabe
 *
 * Kein DOM-Zugriff — läuft in Window, Worker und Node.
 */

export interface Point {
  x: number;
  y: number;
}

export type TurnPolicy =
  | "black"
  | "white"
  | "left"
  | "right"
  | "minority"
  | "majority";

export interface TraceParams {
  turnpolicy: TurnPolicy;
  /** Inseln bis zu dieser Fläche (px) unterdrücken. */
  turdsize: number;
  /** Eckenschwelle: niedrig = mehr Ecken, hoch = mehr Rundungen. Bereich 0..1.34. */
  alphamax: number;
  /** Bézier-Segmente zusammenfassen (Phase 5). */
  optcurve: boolean;
  /** Toleranz der Kurvenoptimierung. */
  opttolerance: number;
}

export const DEFAULT_PARAMS: TraceParams = {
  turnpolicy: "minority",
  turdsize: 2,
  alphamax: 1.0,
  optcurve: true,
  opttolerance: 0.2,
};

export type SegmentTag = "CURVE" | "CORNER";

export class Bitmap {
  readonly w: number;
  readonly h: number;
  readonly size: number;
  data: Uint8Array;

  constructor(w: number, h: number, data?: Uint8Array) {
    this.w = w;
    this.h = h;
    this.size = w * h;
    this.data = data ?? new Uint8Array(this.size);
  }

  at(x: number, y: number): boolean {
    return (
      x >= 0 &&
      x < this.w &&
      y >= 0 &&
      y < this.h &&
      this.data[this.w * y + x] === 1
    );
  }

  index(i: number): Point {
    return { x: i % this.w, y: (i / this.w) | 0 };
  }

  flip(x: number, y: number): void {
    const i = this.w * y + x;
    this.data[i] = this.data[i] ? 0 : 1;
  }

  copy(): Bitmap {
    return new Bitmap(this.w, this.h, this.data.slice());
  }
}

interface Sums {
  x: number;
  y: number;
  xy: number;
  x2: number;
  y2: number;
}

export class Curve {
  readonly n: number;
  tag: SegmentTag[];
  /** Kontrollpunkte, 3 pro Segment. */
  c: Point[];
  alphaCurve = 0;
  vertex: Point[];
  alpha: number[];
  alpha0: number[];
  beta: number[];

  constructor(n: number) {
    this.n = n;
    this.tag = new Array<SegmentTag>(n);
    this.c = new Array<Point>(n * 3);
    this.vertex = new Array<Point>(n);
    this.alpha = new Array<number>(n);
    this.alpha0 = new Array<number>(n);
    this.beta = new Array<number>(n);
  }
}

export class Path {
  area = 0;
  len = 0;
  pt: Point[] = [];
  minX = 100000;
  minY = 100000;
  maxX = -1;
  maxY = -1;
  sign: "+" | "-" = "+";
  x0 = 0;
  y0 = 0;
  sums: Sums[] = [];
  lon: number[] = [];
  po: number[] = [];
  m = 0;
  curve: Curve | null = null;
}

export interface TraceResult {
  pathlist: Path[];
  w: number;
  h: number;
}

// ---------- Vektor-Mathematik ----------

function sign(x: number): number {
  return x > 0 ? 1 : x < 0 ? -1 : 0;
}

function mod(a: number, n: number): number {
  return a >= n ? a % n : a >= 0 ? a : n - 1 - ((-1 - a) % n);
}

function xprod(p1: Point, p2: Point): number {
  return p1.x * p2.y - p1.y * p2.x;
}

function cyclic(a: number, b: number, c: number): boolean {
  return a <= c ? a <= b && b < c : a <= b || b < c;
}

function ddist(p: Point, q: Point): number {
  return Math.sqrt((p.x - q.x) ** 2 + (p.y - q.y) ** 2);
}

function dpara(p0: Point, p1: Point, p2: Point): number {
  const x1 = p1.x - p0.x;
  const y1 = p1.y - p0.y;
  const x2 = p2.x - p0.x;
  const y2 = p2.y - p0.y;
  return x1 * y2 - x2 * y1;
}

function cprod(p0: Point, p1: Point, p2: Point, p3: Point): number {
  const x1 = p1.x - p0.x;
  const y1 = p1.y - p0.y;
  const x2 = p3.x - p2.x;
  const y2 = p3.y - p2.y;
  return x1 * y2 - x2 * y1;
}

function iprod(p0: Point, p1: Point, p2: Point): number {
  const x1 = p1.x - p0.x;
  const y1 = p1.y - p0.y;
  const x2 = p2.x - p0.x;
  const y2 = p2.y - p0.y;
  return x1 * x2 + y1 * y2;
}

function iprod1(p0: Point, p1: Point, p2: Point, p3: Point): number {
  const x1 = p1.x - p0.x;
  const y1 = p1.y - p0.y;
  const x2 = p3.x - p2.x;
  const y2 = p3.y - p2.y;
  return x1 * x2 + y1 * y2;
}

function interval(lambda: number, a: Point, b: Point): Point {
  return { x: a.x + lambda * (b.x - a.x), y: a.y + lambda * (b.y - a.y) };
}

function dorthInfty(p0: Point, p2: Point): Point {
  return { x: -sign(p2.y - p0.y), y: sign(p2.x - p0.x) };
}

function ddenom(p0: Point, p2: Point): number {
  const r = dorthInfty(p0, p2);
  return r.y * (p2.x - p0.x) - r.x * (p2.y - p0.y);
}

function bezier(t: number, p0: Point, p1: Point, p2: Point, p3: Point): Point {
  const s = 1 - t;
  return {
    x:
      s * s * s * p0.x +
      3 * (s * s * t) * p1.x +
      3 * (t * t * s) * p2.x +
      t * t * t * p3.x,
    y:
      s * s * s * p0.y +
      3 * (s * s * t) * p1.y +
      3 * (t * t * s) * p2.y +
      t * t * t * p3.y,
  };
}

function tangent(
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  q0: Point,
  q1: Point,
): number {
  const A = cprod(p0, p1, q0, q1);
  const B = cprod(p1, p2, q0, q1);
  const C = cprod(p2, p3, q0, q1);
  const a = A - 2 * B + C;
  const b = -2 * A + 2 * B;
  const c = A;
  const d = b * b - 4 * a * c;
  if (a === 0 || d < 0) return -1.0;
  const s = Math.sqrt(d);
  const r1 = (-b + s) / (2 * a);
  const r2 = (-b - s) / (2 * a);
  if (r1 >= 0 && r1 <= 1) return r1;
  if (r2 >= 0 && r2 <= 1) return r2;
  return -1.0;
}

// ---------- Phase 1: Bitmap -> Pfadliste ----------

function bmToPathlist(bm: Bitmap, info: TraceParams): Path[] {
  const bm1 = bm.copy();
  const pathlist: Path[] = [];
  let cur: Point | null = { x: 0, y: 0 };

  function findNext(point: Point): Point | null {
    let i = bm1.w * point.y + point.x;
    while (i < bm1.size && bm1.data[i] !== 1) i++;
    return i < bm1.size ? bm1.index(i) : null;
  }

  function majority(x: number, y: number): number {
    for (let i = 2; i < 5; i++) {
      let ct = 0;
      for (let a = -i + 1; a <= i - 1; a++) {
        ct += bm1.at(x + a, y + i - 1) ? 1 : -1;
        ct += bm1.at(x + i - 1, y + a - 1) ? 1 : -1;
        ct += bm1.at(x + a - 1, y - i) ? 1 : -1;
        ct += bm1.at(x - i, y + a) ? 1 : -1;
      }
      if (ct > 0) return 1;
      if (ct < 0) return 0;
    }
    return 0;
  }

  function findPath(point: Point): Path {
    const path = new Path();
    let x = point.x;
    let y = point.y;
    let dirx = 0;
    let diry = 1;
    let tmp: number;
    path.sign = bm.at(point.x, point.y) ? "+" : "-";
    for (;;) {
      path.pt.push({ x, y });
      if (x > path.maxX) path.maxX = x;
      if (x < path.minX) path.minX = x;
      if (y > path.maxY) path.maxY = y;
      if (y < path.minY) path.minY = y;
      path.len++;
      x += dirx;
      y += diry;
      path.area -= x * diry;
      if (x === point.x && y === point.y) break;
      const l = bm1.at(
        x + (dirx + diry - 1) / 2,
        y + (diry - dirx - 1) / 2,
      );
      const r = bm1.at(
        x + (dirx - diry - 1) / 2,
        y + (diry + dirx - 1) / 2,
      );
      if (r && !l) {
        if (
          info.turnpolicy === "right" ||
          (info.turnpolicy === "black" && path.sign === "+") ||
          (info.turnpolicy === "white" && path.sign === "-") ||
          (info.turnpolicy === "majority" && majority(x, y) !== 0) ||
          (info.turnpolicy === "minority" && majority(x, y) === 0)
        ) {
          tmp = dirx;
          dirx = -diry;
          diry = tmp; // links
        } else {
          tmp = dirx;
          dirx = diry;
          diry = -tmp; // rechts
        }
      } else if (r) {
        tmp = dirx;
        dirx = -diry;
        diry = tmp; // links
      } else if (!l) {
        tmp = dirx;
        dirx = diry;
        diry = -tmp; // rechts
      }
    }
    return path;
  }

  function xorPath(path: Path): void {
    let y1 = path.pt[0].y;
    const len = path.len;
    for (let i = 1; i < len; i++) {
      const x = path.pt[i].x;
      const y = path.pt[i].y;
      if (y !== y1) {
        const minY = y1 < y ? y1 : y;
        const maxX = path.maxX;
        for (let j = x; j < maxX; j++) bm1.flip(j, minY);
        y1 = y;
      }
    }
  }

  while ((cur = findNext(cur)) !== null) {
    const path = findPath(cur);
    xorPath(path);
    if (path.area > info.turdsize) pathlist.push(path);
  }
  return pathlist;
}

// ---------- Phase 2: Pfad -> Polygon ----------

function calcSums(path: Path): void {
  path.x0 = path.pt[0].x;
  path.y0 = path.pt[0].y;
  path.sums = [];
  const s = path.sums;
  s.push({ x: 0, y: 0, xy: 0, x2: 0, y2: 0 });
  for (let i = 0; i < path.len; i++) {
    const x = path.pt[i].x - path.x0;
    const y = path.pt[i].y - path.y0;
    s.push({
      x: s[i].x + x,
      y: s[i].y + y,
      xy: s[i].xy + x * y,
      x2: s[i].x2 + x * x,
      y2: s[i].y2 + y * y,
    });
  }
}

function calcLon(path: Path): void {
  const n = path.len;
  const pt = path.pt;
  const pivk = new Array<number>(n);
  const nc = new Array<number>(n);
  const ct = [0, 0, 0, 0];
  path.lon = new Array<number>(n);
  const constraint: [Point, Point] = [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  ];
  const cur: Point = { x: 0, y: 0 };
  const off: Point = { x: 0, y: 0 };
  const dk: Point = { x: 0, y: 0 };
  let foundk: number;

  let k = 0;
  for (let i = n - 1; i >= 0; i--) {
    if (pt[i].x !== pt[k].x && pt[i].y !== pt[k].y) k = i + 1;
    nc[i] = k;
  }

  for (let i = n - 1; i >= 0; i--) {
    ct[0] = ct[1] = ct[2] = ct[3] = 0;
    let dir =
      (3 +
        3 * (pt[mod(i + 1, n)].x - pt[i].x) +
        (pt[mod(i + 1, n)].y - pt[i].y)) /
      2;
    ct[dir]++;
    constraint[0].x = 0;
    constraint[0].y = 0;
    constraint[1].x = 0;
    constraint[1].y = 0;

    k = nc[i];
    let k1 = i;
    for (;;) {
      foundk = 0;
      dir =
        (3 + 3 * sign(pt[k].x - pt[k1].x) + sign(pt[k].y - pt[k1].y)) / 2;
      ct[dir]++;
      if (ct[0] && ct[1] && ct[2] && ct[3]) {
        pivk[i] = k1;
        foundk = 1;
        break;
      }
      cur.x = pt[k].x - pt[i].x;
      cur.y = pt[k].y - pt[i].y;
      if (xprod(constraint[0], cur) < 0 || xprod(constraint[1], cur) > 0)
        break;
      if (Math.abs(cur.x) <= 1 && Math.abs(cur.y) <= 1) {
        // innerhalb der Einheitszelle: keine Einschränkung nötig
      } else {
        off.x = cur.x + (cur.y >= 0 && (cur.y > 0 || cur.x < 0) ? 1 : -1);
        off.y = cur.y + (cur.x <= 0 && (cur.x < 0 || cur.y < 0) ? 1 : -1);
        if (xprod(constraint[0], off) >= 0) {
          constraint[0].x = off.x;
          constraint[0].y = off.y;
        }
        off.x = cur.x + (cur.y <= 0 && (cur.y < 0 || cur.x < 0) ? 1 : -1);
        off.y = cur.y + (cur.x >= 0 && (cur.x > 0 || cur.y < 0) ? 1 : -1);
        if (xprod(constraint[1], off) <= 0) {
          constraint[1].x = off.x;
          constraint[1].y = off.y;
        }
      }
      k1 = k;
      k = nc[k1];
      if (!cyclic(k, i, k1)) break;
    }
    if (foundk === 0) {
      dk.x = sign(pt[k].x - pt[k1].x);
      dk.y = sign(pt[k].y - pt[k1].y);
      cur.x = pt[k1].x - pt[i].x;
      cur.y = pt[k1].y - pt[i].y;
      const a = xprod(constraint[0], cur);
      const b = xprod(constraint[0], dk);
      const c = xprod(constraint[1], cur);
      const d = xprod(constraint[1], dk);
      let j = 10000000;
      if (b < 0) j = Math.floor(a / -b);
      if (d > 0) j = Math.min(j, Math.floor(-c / d));
      pivk[i] = mod(k1 + j, n);
    }
  }

  let j = pivk[n - 1];
  path.lon[n - 1] = j;
  for (let i = n - 2; i >= 0; i--) {
    if (cyclic(i + 1, pivk[i], j)) j = pivk[i];
    path.lon[i] = j;
  }
  for (let i = n - 1; cyclic(mod(i + 1, n), j, path.lon[i]); i--)
    path.lon[i] = j;
}

function penalty3(path: Path, i: number, j: number): number {
  const n = path.len;
  const pt = path.pt;
  const sums = path.sums;
  let r = 0;
  if (j >= n) {
    j -= n;
    r = 1;
  }
  let x: number, y: number, x2: number, xy: number, y2: number, k: number;
  if (r === 0) {
    x = sums[j + 1].x - sums[i].x;
    y = sums[j + 1].y - sums[i].y;
    x2 = sums[j + 1].x2 - sums[i].x2;
    xy = sums[j + 1].xy - sums[i].xy;
    y2 = sums[j + 1].y2 - sums[i].y2;
    k = j + 1 - i;
  } else {
    x = sums[j + 1].x - sums[i].x + sums[n].x;
    y = sums[j + 1].y - sums[i].y + sums[n].y;
    x2 = sums[j + 1].x2 - sums[i].x2 + sums[n].x2;
    xy = sums[j + 1].xy - sums[i].xy + sums[n].xy;
    y2 = sums[j + 1].y2 - sums[i].y2 + sums[n].y2;
    k = j + 1 - i + n;
  }
  const px = (pt[i].x + pt[j].x) / 2.0 - pt[0].x;
  const py = (pt[i].y + pt[j].y) / 2.0 - pt[0].y;
  const ey = pt[j].x - pt[i].x;
  const ex = -(pt[j].y - pt[i].y);
  const a = (x2 - 2 * x * px) / k + px * px;
  const b = (xy - x * py - y * px) / k + px * py;
  const c = (y2 - 2 * y * py) / k + py * py;
  const s = ex * ex * a + 2 * ex * ey * b + ey * ey * c;
  return Math.sqrt(s);
}

function bestPolygon(path: Path): void {
  const n = path.len;
  const pen = new Array<number>(n + 1);
  const prev = new Array<number>(n + 1);
  const clip0 = new Array<number>(n);
  const clip1 = new Array<number>(n + 1);
  const seg0 = new Array<number>(n + 1);
  const seg1 = new Array<number>(n + 1);

  for (let i = 0; i < n; i++) {
    let c = mod(path.lon[mod(i - 1, n)] - 1, n);
    if (c === i) c = mod(i + 1, n);
    clip0[i] = c < i ? n : c;
  }
  let j = 1;
  for (let i = 0; i < n; i++) {
    while (j <= clip0[i]) {
      clip1[j] = i;
      j++;
    }
  }
  let i = 0;
  for (j = 0; i < n; j++) {
    seg0[j] = i;
    i = clip0[i];
  }
  seg0[j] = n;
  const m = j;
  i = n;
  for (j = m; j > 0; j--) {
    seg1[j] = i;
    i = clip1[i];
  }
  seg1[0] = 0;

  pen[0] = 0;
  for (j = 1; j <= m; j++) {
    for (i = seg1[j]; i <= seg0[j]; i++) {
      let best = -1;
      for (let k = seg0[j - 1]; k >= clip1[i]; k--) {
        const thispen = penalty3(path, k, i) + pen[k];
        if (best < 0 || thispen < best) {
          prev[i] = k;
          best = thispen;
        }
      }
      pen[i] = best;
    }
  }
  path.m = m;
  path.po = new Array<number>(m);
  for (i = n, j = m - 1; i > 0; j--) {
    i = prev[i];
    path.po[j] = i;
  }
}

// ---------- Phase 3: Polygon -> Vertices (Least Squares) ----------

function pointslope(
  path: Path,
  i: number,
  j: number,
  ctr: Point,
  dir: Point,
): void {
  const n = path.len;
  const sums = path.sums;
  let r = 0;
  while (j >= n) {
    j -= n;
    r += 1;
  }
  while (i >= n) {
    i -= n;
    r -= 1;
  }
  while (j < 0) {
    j += n;
    r -= 1;
  }
  while (i < 0) {
    i += n;
    r += 1;
  }
  const x = sums[j + 1].x - sums[i].x + r * sums[n].x;
  const y = sums[j + 1].y - sums[i].y + r * sums[n].y;
  const x2 = sums[j + 1].x2 - sums[i].x2 + r * sums[n].x2;
  const xy = sums[j + 1].xy - sums[i].xy + r * sums[n].xy;
  const y2 = sums[j + 1].y2 - sums[i].y2 + r * sums[n].y2;
  const k = j + 1 - i + r * n;
  ctr.x = x / k;
  ctr.y = y / k;
  let a = (x2 - (x * x) / k) / k;
  const b = (xy - (x * y) / k) / k;
  let c = (y2 - (y * y) / k) / k;
  const lambda2 = (a + c + Math.sqrt((a - c) * (a - c) + 4 * b * b)) / 2;
  a -= lambda2;
  c -= lambda2;
  let l: number;
  if (Math.abs(a) >= Math.abs(c)) {
    l = Math.sqrt(a * a + b * b);
    if (l !== 0) {
      dir.x = -b / l;
      dir.y = a / l;
    }
  } else {
    l = Math.sqrt(c * c + b * b);
    if (l !== 0) {
      dir.x = -c / l;
      dir.y = b / l;
    }
  }
  if (l === 0) {
    dir.x = 0;
    dir.y = 0;
  }
}

type Mat3 = [
  [number, number, number],
  [number, number, number],
  [number, number, number],
];

function quadform(Q: Mat3, w: Point): number {
  const v = [w.x, w.y, 1];
  let sum = 0;
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) sum += v[i] * Q[i][j] * v[j];
  return sum;
}

function adjustVertices(path: Path): void {
  const m = path.m;
  const po = path.po;
  const n = path.len;
  const pt = path.pt;
  const x0 = path.x0;
  const y0 = path.y0;
  const ctr = new Array<Point>(m);
  const dir = new Array<Point>(m);
  const q = new Array<Mat3>(m);
  const v: [number, number, number] = [0, 0, 0];
  const s: Point = { x: 0, y: 0 };

  path.curve = new Curve(m);

  for (let i = 0; i < m; i++) {
    let j = po[mod(i + 1, m)];
    j = mod(j - po[i], n) + po[i];
    ctr[i] = { x: 0, y: 0 };
    dir[i] = { x: 0, y: 0 };
    pointslope(path, po[i], j, ctr[i], dir[i]);
  }

  for (let i = 0; i < m; i++) {
    q[i] = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    const d = dir[i].x * dir[i].x + dir[i].y * dir[i].y;
    if (d !== 0) {
      v[0] = dir[i].y;
      v[1] = -dir[i].x;
      v[2] = -v[1] * ctr[i].y - v[0] * ctr[i].x;
      for (let l = 0; l < 3; l++)
        for (let k = 0; k < 3; k++) q[i][l][k] = (v[l] * v[k]) / d;
    }
  }

  const curve = path.curve;
  for (let i = 0; i < m; i++) {
    const Q2: Mat3 = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    const w: [number, number] = [0, 0];
    s.x = pt[po[i]].x - x0;
    s.y = pt[po[i]].y - y0;
    const j = mod(i - 1, m);
    for (let l = 0; l < 3; l++)
      for (let k = 0; k < 3; k++) Q2[l][k] = q[j][l][k] + q[i][l][k];

    const det = Q2[0][0] * Q2[1][1] - Q2[0][1] * Q2[1][0];
    let solved = false;
    if (det !== 0) {
      w[0] = (-Q2[0][2] * Q2[1][1] + Q2[1][2] * Q2[0][1]) / det;
      w[1] = (Q2[0][2] * Q2[1][0] - Q2[1][2] * Q2[0][0]) / det;
      solved = true;
    }

    if (solved) {
      const dx = Math.abs(w[0] - s.x);
      const dy = Math.abs(w[1] - s.y);
      if (dx <= 0.5 && dy <= 0.5) {
        curve.vertex[i] = { x: w[0] + x0, y: w[1] + y0 };
        continue;
      }
    }

    // Constrained minimum innerhalb der Einheitszelle um s
    let min = quadform(Q2, s);
    let xv = s.x;
    let yv = s.y;
    if (Q2[0][0] !== 0) {
      for (let z = 0; z < 2; z++) {
        const wv = s.y - 0.5 + z;
        const ww = -(Q2[1][0] * wv + Q2[2][0]) / Q2[0][0];
        const dx = Math.abs(ww - s.x);
        const cand =
          Q2[0][0] * ww * ww +
          2 * Q2[1][0] * ww * wv +
          Q2[1][1] * wv * wv +
          2 * Q2[2][0] * ww +
          2 * Q2[2][1] * wv +
          Q2[2][2];
        if (dx <= 0.5 && cand < min) {
          min = cand;
          xv = ww;
          yv = wv;
        }
      }
    }
    if (Q2[1][1] !== 0) {
      for (let z = 0; z < 2; z++) {
        const wv = s.x - 0.5 + z;
        const ww = -(Q2[0][1] * wv + Q2[2][1]) / Q2[1][1];
        const dy = Math.abs(ww - s.y);
        const cand =
          Q2[0][0] * wv * wv +
          2 * Q2[1][0] * wv * ww +
          Q2[1][1] * ww * ww +
          2 * Q2[2][0] * wv +
          2 * Q2[2][1] * ww +
          Q2[2][2];
        if (dy <= 0.5 && cand < min) {
          min = cand;
          xv = wv;
          yv = ww;
        }
      }
    }
    for (let l = 0; l < 2; l++) {
      for (let k = 0; k < 2; k++) {
        const wv = s.x - 0.5 + l;
        const ww = s.y - 0.5 + k;
        const cand =
          Q2[0][0] * wv * wv +
          2 * Q2[1][0] * wv * ww +
          Q2[1][1] * ww * ww +
          2 * Q2[2][0] * wv +
          2 * Q2[2][1] * ww +
          Q2[2][2];
        if (cand < min) {
          min = cand;
          xv = wv;
          yv = ww;
        }
      }
    }
    curve.vertex[i] = { x: xv + x0, y: yv + y0 };
  }
}

// ---------- Phase 4: Glättung & Ecken ----------

function smooth(path: Path, info: TraceParams): void {
  const curve = path.curve;
  if (!curve) return;
  const m = curve.n;
  for (let i = 0; i < m; i++) {
    const j = mod(i + 1, m);
    const k = mod(i + 2, m);
    const p4 = interval(0.5, curve.vertex[k], curve.vertex[j]);
    const denom = ddenom(curve.vertex[i], curve.vertex[k]);
    let alpha: number;
    if (denom !== 0) {
      let dd = dpara(curve.vertex[i], curve.vertex[j], curve.vertex[k]) / denom;
      dd = Math.abs(dd);
      alpha = dd > 1 ? 1 - 1.0 / dd : 0;
      alpha = alpha / 0.75;
    } else alpha = 4 / 3;
    curve.alpha0[j] = alpha;
    if (alpha >= info.alphamax) {
      curve.tag[j] = "CORNER";
      curve.c[3 * j + 1] = curve.vertex[j];
      curve.c[3 * j + 2] = p4;
    } else {
      if (alpha < 0.55) alpha = 0.55;
      else if (alpha > 1) alpha = 1;
      const p2 = interval(0.5 + 0.5 * alpha, curve.vertex[i], curve.vertex[j]);
      const p3 = interval(0.5 + 0.5 * alpha, curve.vertex[k], curve.vertex[j]);
      curve.tag[j] = "CURVE";
      curve.c[3 * j + 0] = p2;
      curve.c[3 * j + 1] = p3;
      curve.c[3 * j + 2] = p4;
    }
    curve.alpha[j] = alpha;
    curve.beta[j] = 0.5;
  }
  curve.alphaCurve = 1;
}

// ---------- Phase 5: Kurvenoptimierung ----------

interface Opti {
  pen: number;
  c: [Point, Point];
  t: number;
  s: number;
  alpha: number;
}

function optiPenalty(
  path: Path,
  i: number,
  j: number,
  res: Opti,
  opttolerance: number,
  convc: number[],
  areac: number[],
): number {
  const curve = path.curve;
  if (!curve) return 1;
  const m = curve.n;
  const vertex = curve.vertex;
  if (i === j) return 1;
  let k = i;
  const i1 = mod(i + 1, m);
  let k1 = mod(k + 1, m);
  const conv = convc[k1];
  if (conv === 0) return 1;
  const d0 = ddist(vertex[i], vertex[i1]);
  for (k = k1; k !== j; k = k1) {
    k1 = mod(k + 1, m);
    const k2 = mod(k + 2, m);
    if (convc[k1] !== conv) return 1;
    if (sign(cprod(vertex[i], vertex[i1], vertex[k1], vertex[k2])) !== conv)
      return 1;
    if (
      iprod1(vertex[i], vertex[i1], vertex[k1], vertex[k2]) <
      d0 * ddist(vertex[k1], vertex[k2]) * -0.999847695156
    )
      return 1;
  }
  const p0: Point = { ...curve.c[mod(i, m) * 3 + 2] };
  let p1: Point = { ...vertex[mod(i + 1, m)] };
  let p2: Point = { ...vertex[mod(j, m)] };
  const p3: Point = { ...curve.c[mod(j, m) * 3 + 2] };

  let area = areac[j] - areac[i];
  area -= dpara(vertex[0], curve.c[i * 3 + 2], curve.c[j * 3 + 2]) / 2;
  if (i >= j) area += areac[m];

  const A1 = dpara(p0, p1, p2);
  const A2 = dpara(p0, p1, p3);
  const A3 = dpara(p0, p2, p3);
  const A4 = A1 + A3 - A2;
  if (A2 === A1) return 1;
  const t = A3 / (A3 - A4);
  const s = A2 / (A2 - A1);
  const A = (A2 * t) / 2.0;
  if (A === 0.0) return 1;
  const R = area / A;
  const alpha = 2 - Math.sqrt(4 - R / 0.3);

  res.c = [interval(t * alpha, p0, p1), interval(s * alpha, p3, p2)];
  res.t = t;
  res.s = s;
  res.alpha = alpha;
  p1 = res.c[0];
  p2 = res.c[1];
  res.pen = 0;

  for (k = mod(i + 1, m); k !== j; k = k1) {
    k1 = mod(k + 1, m);
    const tt = tangent(p0, p1, p2, p3, vertex[k], vertex[k1]);
    if (tt < -0.5) return 1;
    const pt = bezier(tt, p0, p1, p2, p3);
    const dd = ddist(vertex[k], vertex[k1]);
    if (dd === 0.0) return 1;
    const d1 = dpara(vertex[k], vertex[k1], pt) / dd;
    if (Math.abs(d1) > opttolerance) return 1;
    if (
      iprod(vertex[k], vertex[k1], pt) < 0 ||
      iprod(vertex[k1], vertex[k], pt) < 0
    )
      return 1;
    res.pen += d1 * d1;
  }
  for (k = i; k !== j; k = k1) {
    k1 = mod(k + 1, m);
    const tt = tangent(p0, p1, p2, p3, curve.c[k * 3 + 2], curve.c[k1 * 3 + 2]);
    if (tt < -0.5) return 1;
    const pt = bezier(tt, p0, p1, p2, p3);
    const dd = ddist(curve.c[k * 3 + 2], curve.c[k1 * 3 + 2]);
    if (dd === 0.0) return 1;
    let d1 = dpara(curve.c[k * 3 + 2], curve.c[k1 * 3 + 2], pt) / dd;
    let d2 = dpara(curve.c[k * 3 + 2], curve.c[k1 * 3 + 2], vertex[k1]) / dd;
    d2 *= 0.75 * curve.alpha[k1];
    if (d2 < 0) {
      d1 = -d1;
      d2 = -d2;
    }
    if (d1 < d2 - opttolerance) return 1;
    if (d1 < d2) res.pen += (d1 - d2) * (d1 - d2);
  }
  return 0;
}

function optiCurve(path: Path, info: TraceParams): void {
  const curve = path.curve;
  if (!curve) return;
  const m = curve.n;
  const vert = curve.vertex;
  const pt = new Array<number>(m + 1);
  const pen = new Array<number>(m + 1);
  const len = new Array<number>(m + 1);
  const opt = new Array<Opti | undefined>(m + 1);
  const convc = new Array<number>(m);
  const areac = new Array<number>(m + 1);
  const o: Opti = {
    pen: 0,
    c: [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ],
    t: 0,
    s: 0,
    alpha: 0,
  };

  for (let i = 0; i < m; i++) {
    if (curve.tag[i] === "CURVE")
      convc[i] = sign(
        dpara(vert[mod(i - 1, m)], vert[i], vert[mod(i + 1, m)]),
      );
    else convc[i] = 0;
  }
  let area = 0.0;
  areac[0] = 0.0;
  const p0 = curve.vertex[0];
  for (let i = 0; i < m; i++) {
    const i1 = mod(i + 1, m);
    if (curve.tag[i1] === "CURVE") {
      const a = curve.alpha[i1];
      area +=
        (0.3 *
          a *
          (4 - a) *
          dpara(curve.c[i * 3 + 2], vert[i1], curve.c[i1 * 3 + 2])) /
        2;
      area += dpara(p0, curve.c[i * 3 + 2], curve.c[i1 * 3 + 2]) / 2;
    }
    areac[i + 1] = area;
  }

  pt[0] = -1;
  pen[0] = 0;
  len[0] = 0;
  for (let j = 1; j <= m; j++) {
    pt[j] = j - 1;
    pen[j] = pen[j - 1];
    len[j] = len[j - 1] + 1;
    for (let i = j - 2; i >= 0; i--) {
      const r = optiPenalty(path, i, mod(j, m), o, info.opttolerance, convc, areac);
      if (r) break;
      if (
        len[j] > len[i] + 1 ||
        (len[j] === len[i] + 1 && pen[j] > pen[i] + o.pen)
      ) {
        pt[j] = i;
        pen[j] = pen[i] + o.pen;
        len[j] = len[i] + 1;
        opt[j] = { pen: o.pen, c: [o.c[0], o.c[1]], t: o.t, s: o.s, alpha: o.alpha };
      }
    }
  }
  const om = len[m];
  const ocurve = new Curve(om);
  let j = m;
  for (let i = om - 1; i >= 0; i--) {
    const oj = opt[j];
    if (pt[j] === j - 1 || oj === undefined) {
      ocurve.tag[i] = curve.tag[mod(j, m)];
      ocurve.c[i * 3 + 0] = curve.c[mod(j, m) * 3 + 0];
      ocurve.c[i * 3 + 1] = curve.c[mod(j, m) * 3 + 1];
      ocurve.c[i * 3 + 2] = curve.c[mod(j, m) * 3 + 2];
      ocurve.vertex[i] = curve.vertex[mod(j, m)];
      ocurve.alpha[i] = curve.alpha[mod(j, m)];
      ocurve.alpha0[i] = curve.alpha0[mod(j, m)];
      ocurve.beta[i] = curve.beta[mod(j, m)];
    } else {
      ocurve.tag[i] = "CURVE";
      ocurve.c[i * 3 + 0] = oj.c[0];
      ocurve.c[i * 3 + 1] = oj.c[1];
      ocurve.c[i * 3 + 2] = curve.c[mod(j, m) * 3 + 2];
      ocurve.vertex[i] = interval(
        oj.s,
        curve.c[mod(j, m) * 3 + 2],
        vert[mod(j, m)],
      );
      ocurve.alpha[i] = oj.alpha;
      ocurve.alpha0[i] = oj.alpha;
      ocurve.beta[i] = 0.5;
    }
    j = pt[j];
  }
  ocurve.alphaCurve = 1;
  path.curve = ocurve;
}

// ---------- Hauptfunktion ----------

export function trace(bm: Bitmap, opts: Partial<TraceParams> = {}): TraceResult {
  const info: TraceParams = { ...DEFAULT_PARAMS, ...opts };
  const pathlist = bmToPathlist(bm, info);
  for (const path of pathlist) {
    calcSums(path);
    calcLon(path);
    bestPolygon(path);
    adjustVertices(path);
    smooth(path, info);
    if (info.optcurve) {
      try {
        optiCurve(path, info);
      } catch {
        // Optimierung übersprungen — ungeglättete Kurve bleibt gültig
      }
    }
  }
  return { pathlist, w: bm.w, h: bm.h };
}

// ---------- SVG-Ausgabe (relative Kodierung, verifiziert: 0px Drift) ----------

function q3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function nfmt(n: number): string {
  let s = q3(n).toString();
  if (s.startsWith("0.")) s = s.slice(1);
  else if (s.startsWith("-0.")) s = "-" + s.slice(2);
  return s;
}

function pair(x: number, y: number): string {
  const sy = nfmt(y);
  return nfmt(x) + (sy.startsWith("-") ? "" : " ") + sy;
}

/**
 * Serialisiert ein Trace-Ergebnis als SVG-Pfaddaten (d-Attribut).
 * Relative Kommandos (c/l), Deltas auf dem 1/1000-Raster kumuliert
 * (kein Rundungsdrift), kompakte Zahlformatierung.
 */
export function toSVGPathData(result: TraceResult): string {
  let out = "";
  for (const path of result.pathlist) {
    const cv = path.curve;
    if (!cv) continue;
    const n = cv.n;
    let cx = q3(cv.c[(n - 1) * 3 + 2].x);
    let cy = q3(cv.c[(n - 1) * 3 + 2].y);
    out += "M" + pair(cx, cy);
    for (let i = 0; i < n; i++) {
      if (cv.tag[i] === "CURVE") {
        const c1 = cv.c[i * 3];
        const c2 = cv.c[i * 3 + 1];
        const c3 = cv.c[i * 3 + 2];
        const sx = cx;
        const sy = cy;
        const d1x = q3(q3(c1.x) - sx);
        const d1y = q3(q3(c1.y) - sy);
        const d2x = q3(q3(c2.x) - sx);
        const d2y = q3(q3(c2.y) - sy);
        const d3x = q3(q3(c3.x) - sx);
        const d3y = q3(q3(c3.y) - sy);
        out += "c" + pair(d1x, d1y) + " " + pair(d2x, d2y) + " " + pair(d3x, d3y);
        cx = q3(sx + d3x);
        cy = q3(sy + d3y);
      } else {
        for (const cp of [cv.c[i * 3 + 1], cv.c[i * 3 + 2]]) {
          const dx = q3(q3(cp.x) - cx);
          const dy = q3(q3(cp.y) - cy);
          cx = q3(cx + dx);
          cy = q3(cy + dy);
          out += "l" + pair(dx, dy);
        }
      }
    }
    out += "z";
  }
  return out;
}
