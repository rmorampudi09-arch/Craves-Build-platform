// The Banana Leaf look's leaf, drawn in code: one half of a banana leaf as it is cut and served. The apex (tip) is at
// the left, the midrib runs along the top edge, the blade below has veins running toward the tip, and the wide cut end
// at the right is slightly torn. Ported unchanged from the approved theme mockups (themes/leaf/theme.js, 29 Oct 2026).
// Sizes are px of a W x H box. Pure: the same inputs always give the same paths.

export type LeafShape = {
  seed?: number;
  tipX?: number;
  midTip?: number;
  midBase?: number;
  bow?: number;
  dip?: number;
  rib?: number;
  apex?: number;
  belly0?: number;
  belly1?: number;
  p?: number;
  slant?: number;
  gap?: number;
  /** Tears along the cut: [where (0-1), depth px, width px]. */
  tears?: ReadonlyArray<readonly [number, number, number]>;
  /** Splits along a vein: [x as a share of W, depth px]. */
  splits?: ReadonlyArray<readonly [number, number]>;
};

export type LeafGeometry = {
  W: number;
  H: number;
  tipX: number;
  baseX: number;
  blade: string;
  rib: string;
  ribLine: string;
  veins: string[];
  hairs: string[];
  /** Height of the midrib's centre line at x. */
  midY: (x: number) => number;
  /** Thickness of the midrib at x. */
  ribT: (x: number) => number;
  /** Height of the leaf's lower edge at x. */
  marginY: (x: number) => number;
};

type Pt = readonly [number, number];

/** The leaf shape the phone screens use. */
export const PHONE_LEAF: LeafShape = { seed: 23, apex: 0.3, p: 2.6, midTip: 0.34, dip: 2.4, belly0: 0.92, belly1: 0.965, rib: 0.04, gap: 26 };

const f1 = (n: number) => Math.round(n * 10) / 10;

function rng(seed: number): () => number {
  let s = seed % 2147483647;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** A smooth curve through the points as cubic Béziers; the caller has already moved to the first point. */
function smooth(pts: readonly Pt[]): string {
  let d = "";
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    d += `C${f1(p1[0] + (p2[0] - p0[0]) / 6)},${f1(p1[1] + (p2[1] - p0[1]) / 6)} ${f1(p2[0] - (p3[0] - p1[0]) / 6)},${f1(p2[1] - (p3[1] - p1[1]) / 6)} ${f1(p2[0])},${f1(p2[1])}`;
  }
  return d;
}

export function leafGeometry(W: number, H: number, o: LeafShape = {}): LeafGeometry {
  const rand = rng(o.seed || 23);
  const tipX = o.tipX ?? 3;
  const baseX = W - 3;
  const span = baseX - tipX;
  const y0 = (o.midTip ?? 0.2) * H;
  const y1 = (o.midBase ?? 0.065) * H;
  const bow = (o.bow ?? 0.022) * H;
  const clamp = (u: number) => Math.min(1, Math.max(0, u));
  // The midrib runs almost straight, then dips into the apex over the last stretch.
  const midY = (x: number) => {
    const u = clamp((x - tipX) / span);
    return y1 + (y0 - y1) * Math.pow(1 - u, o.dip ?? 4) - bow * Math.sin(Math.PI * u);
  };
  const ribT = (x: number) => 1.2 + ((o.rib ?? 0.032) * H - 1.2) * Math.pow(clamp((x - tipX) / span), 0.8);
  const xr = tipX + (o.apex ?? 0.42) * W;
  const yr = (o.belly0 ?? 0.93) * H;
  const yb = (o.belly1 ?? 0.965) * H;
  const ya = midY(tipX);
  const p = o.p ?? 2.4;

  // The margin from the apex to the cut: it swells out of the apex, then runs long and gently rippled to the cut.
  const margin: Pt[] = [];
  for (let i = 1; i <= 26; i++) {
    const s = Math.pow(i / 26, 1.35);
    margin.push([tipX + (xr - tipX) * s, ya + (yr - ya) * (1 - Math.pow(1 - s, p))]);
  }
  for (let i = 1; i <= 30; i++) {
    const u = i / 30;
    const x = xr + (baseX - xr) * u;
    const ripple = (Math.sin(u * 15.7 + 1.2) * 0.0055 + Math.sin(u * 39 + 0.3) * 0.002) * H * Math.min(1, u * 3);
    margin.push([x, yr + (yb - yr) * u * (2 - u) + ripple]);
  }
  const top: Pt[] = [];
  const ribBottom: Pt[] = [];
  for (let i = 0; i <= 34; i++) {
    const x = tipX + span * Math.pow(i / 34, 1.3);
    top.push([x, midY(x) - ribT(x) / 2]);
    ribBottom.push([x, midY(x) + ribT(x) / 2]);
  }

  // The cut, top to bottom, with a few narrow tears that run down along the veins.
  const yTop = top[top.length - 1][1];
  const yEnd = margin[margin.length - 1][1];
  const cut: Pt[] = [];
  for (const [at, depth, w] of o.tears ?? [[0.32, 8, 1.6], [0.58, 15, 2]]) {
    const y = yTop + (yEnd - yTop) * at;
    cut.push([baseX + (rand() - 0.5) * 1.2, y - w], [baseX - depth, y + depth * 1.15], [baseX - 0.8 + (rand() - 0.5) * 1, y + w]);
  }
  const lines = (pts: readonly Pt[]) => pts.map((q) => `L${f1(q[0])},${f1(q[1])}`).join("");

  // One smooth run from the cut's lower corner, along the margin (split here and there along a vein, as banana leaves
  // do), round the apex and along the midrib to the cut's top.
  let run: Pt[] = [...margin].reverse().concat(top);
  let blade = `M${f1(run[0][0])},${f1(run[0][1])}`;
  for (const [fx, dep] of o.splits ?? [[0.86, 12]]) {
    const j = run.findIndex((q, i) => i > 0 && q[0] <= fx * W);
    if (j < 1 || j > margin.length - 3) continue;
    const a = run[j];
    const b = run[j + 1];
    const m: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    blade += smooth(run.slice(0, j + 1)) + `L${f1(a[0] + dep * 0.45)},${f1(a[1] - dep)}L${f1(m[0])},${f1(m[1])}`;
    run = [m, ...run.slice(j + 1)];
  }
  blade += `${smooth(run)}${lines(cut)}Z`;

  const lastBottom = ribBottom[ribBottom.length - 1];
  const rib = `M${f1(top[0][0])},${f1(top[0][1])}${smooth(top)}L${f1(lastBottom[0])},${f1(lastBottom[1])}${smooth([...ribBottom].reverse())}Z`;
  const highlight: Pt[] = top.slice(3).map(([x]) => [x, midY(x) - ribT(x) * 0.12]);
  const ribLine = `M${f1(highlight[0][0])},${f1(highlight[0][1])}${smooth(highlight)}`;

  // Veins leave the midrib nearly upright and bend toward the tip; every third one is a main vein.
  const veins: string[] = [];
  const hairs: string[] = [];
  const slant = o.slant ?? 0.42;
  const len = H * 1.15;
  const gap = (o.gap ?? 27) / 3;
  let n = 0;
  for (let x0 = tipX + gap * 2; x0 < baseX + H * slant * 1.1; x0 += gap, n++) {
    const xs = Math.min(x0, baseX + 40);
    const ys = midY(xs) + ribT(Math.min(xs, baseX)) / 2 - 0.6;
    const d = `M${f1(x0)},${f1(ys)}Q${f1(x0 - slant * 0.2 * len)},${f1(ys + 0.55 * len)} ${f1(x0 - slant * len)},${f1(ys + len)}`;
    (n % 3 === 1 ? veins : hairs).push(d);
  }
  const marginY = (x: number) => {
    for (let i = 1; i < margin.length; i++) {
      if (margin[i][0] >= x) {
        const a = margin[i - 1];
        const b = margin[i];
        return a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0] || 1);
      }
    }
    return yEnd;
  };
  return { W, H, tipX, baseX, blade, rib, ribLine, veins, hairs, midY, ribT, marginY };
}
