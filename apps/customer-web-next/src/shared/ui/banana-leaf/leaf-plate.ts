// Where each dish sits on the Banana Leaf, in the cart and in the parcel after payment. Serving order decides it, the order every grandmother knows:
// pickle at the tip, then curries, roti and snacks along the midrib; tiffin, meals, rice and biryani by the margin, and
// the sweet last, at the cut. Ported from the approved theme mockup (themes/leaf/theme.js, leafLayout), without name
// labels: the cart lists every dish by name right under the leaf.
import { PHONE_LEAF, type LeafGeometry, type LeafShape } from "./leaf-geometry.ts";

/** The cart's leaf (300 x 150): the cart and the parcel after payment draw the same one. */
export const PLATE_SHAPE: LeafShape = { ...PHONE_LEAF, seed: 9, gap: 22 };

export type Course = "Pickles" | "Curries" | "Roti" | "Snacks" | "Tiffin" | "Meals" | "Rice" | "Biryani" | "Sweets";

// [row: 0 by the midrib, 1 by the margin; order along the row; photo weight]
const COURSE: Record<Course, readonly [0 | 1, number, number]> = {
  Pickles: [0, 0, 0.84],
  Curries: [0, 1, 1],
  Roti: [0, 2, 1.06],
  Snacks: [0, 3, 1],
  Tiffin: [1, 0, 0.92],
  Meals: [1, 1, 1.24],
  Rice: [1, 2, 1.1],
  Biryani: [1, 2, 1.1],
  Sweets: [1, 3, 1],
};
// A row's only dish: its place along the row (0 = the tip end, 1 = the cut end).
const ALONE: Record<Course, number> = { Pickles: 0, Curries: 0.35, Roti: 0.6, Snacks: 0.7, Tiffin: 0.1, Meals: 0.45, Rice: 0.55, Biryani: 0.55, Sweets: 1 };
// Water drops by the tip, kept only where no dish sits: [share of W, share of H, radius px].
const DROPS = [
  [0.16, 0.69, 4.6],
  [0.215, 0.78, 3.2],
  [0.27, 0.64, 3.4],
] as const;
/** More dishes than this crowd the leaf; the rest stay in the list below it. */
export const LEAF_MAX_DISHES = 6;

/** The course a chef's category belongs to (the app's eight, plus the older names). Anything else sits with the curries. */
export function courseOf(category: string | null | undefined): Course {
  const c = (category ?? "").toLowerCase();
  if (/pickle|chutney|podi/.test(c)) return "Pickles";
  if (/sweet|dessert|cake|ice ?cream/.test(c)) return "Sweets";
  if (/meal|thali/.test(c)) return "Meals";
  if (/biry?i?ani/.test(c)) return "Biryani";
  if (/rice/.test(c)) return "Rice";
  if (/tiffin|breakfast/.test(c)) return "Tiffin";
  if (/roti|chapati|phulka|paratha/.test(c)) return "Roti";
  if (/snack|snake|fast food/.test(c)) return "Snacks";
  return "Curries";
}

export type PlateItem = { key: string; course: Course };
export type PlacedDish = PlateItem & { row: 0 | 1; x: number; y: number; size: number };
export type LeafLayout = { dishes: PlacedDish[]; drops: Array<[number, number, number]>; fits: boolean };

type Working = PlateItem & { row: 0 | 1; order: number; weight: number; index: number; x: number; y: number; size: number; r: number };

/** Places the dishes on the leaf, all in leaf px. Photos shrink together (never under 44 px) until no two touch. */
export function leafLayout(
  items: readonly PlateItem[],
  g: LeafGeometry,
  o: { pad?: number; gap?: number; cut?: number; base?: number } = {},
): LeafLayout {
  const pad = o.pad ?? 6;
  const gap = o.gap ?? 8;
  const cut = o.cut ?? 18;
  const laneMax = g.W * 0.36;
  const under = (x: number) => g.midY(x) + g.ribT(x) / 2;
  const across = (x: number, r: number, f: (v: number) => number) => [-1, -0.5, 0, 0.5, 1].map((k) => f(x + k * r));
  const dishes: Working[] = items
    .map((item, index) => {
      const [row, order, weight] = COURSE[item.course];
      return { ...item, row, order, weight, index, x: 0, y: 0, size: 0, r: 0 };
    })
    .sort((a, b) => a.row - b.row || a.order - b.order || a.index - b.index);
  const rows = [0, 1].map((r) => dishes.filter((dish) => dish.row === r));

  let clash = true;
  for (let tries = 0, scale = 1; clash && tries < 14; tries++, scale *= 0.93) {
    const base = (o.base ?? g.H * 0.27) * scale;
    for (const dish of dishes) {
      dish.size = Math.max(44, Math.round(base * dish.weight));
      dish.r = dish.size / 2;
    }
    const rTop = Math.max(0, ...rows[0].map((dish) => dish.r));
    clash = false;
    rows.forEach((row, ri) => {
      if (!row.length) return;
      // The leaf narrows to its tip: a row starts where its first photo fits across the blade (the margin row also
      // leaves room for a photo on the midrib row).
      const need = 2 * row[0].r + 2 * pad + (ri ? 2 * rTop + pad : 0);
      let xa = g.tipX;
      while (xa < g.baseX && Math.min(...across(xa, row[0].r, (v) => g.marginY(v) - under(v))) < need) xa += 2;
      const n = row.length;
      const xe = g.baseX - cut - row[n - 1].r;
      const step = n > 1 ? Math.min((xe - xa) / (n - 1), laneMax) : 0;
      if (xe < xa) clash = true;
      row.forEach((dish, k) => {
        dish.x = n === 1 ? xa + (xe - xa) * ALONE[dish.course] : ri ? xe - (n - 1 - k) * step : xa + k * step;
        dish.y = ri
          ? Math.min(...across(dish.x, dish.r, g.marginY)) - pad - dish.r
          : Math.max(...across(dish.x, dish.r, under)) + pad + dish.r;
      });
    });
    dishes.forEach((a, i) =>
      dishes.slice(i + 1).forEach((b) => {
        if (Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r + gap) clash = true;
      }),
    );
  }

  const drops = DROPS.map(([fx, fy, r]): [number, number, number] => [fx * g.W, fy * g.H, r * Math.min(1.2, g.H / 214)]).filter(
    ([x, y, r]) =>
      y - r - 3 > under(x) && y + r + 3 < g.marginY(x) && dishes.every((dish) => Math.hypot(dish.x - x, dish.y - y) > dish.r + r + 8),
  );
  return {
    dishes: dishes.map(({ key, course, row, x, y, size }) => ({ key, course, row, x, y, size })),
    drops,
    fits: !clash,
  };
}

/** Lays out as many dishes as fit (at most LEAF_MAX_DISHES, in the cart's order); the rest stay in the list. */
export function fitOnLeaf(items: readonly PlateItem[], g: LeafGeometry, o?: Parameters<typeof leafLayout>[2]): LeafLayout & { hidden: number } {
  for (let count = Math.min(items.length, LEAF_MAX_DISHES); count > 1; count--) {
    const layout = leafLayout(items.slice(0, count), g, o);
    if (layout.fits) return { ...layout, hidden: items.length - count };
  }
  return { ...leafLayout(items.slice(0, 1), g, o), hidden: Math.max(0, items.length - 1) };
}

const PLACE: Record<Course, (n: number) => string> = {
  Pickles: () => "pickle at the tip",
  Curries: (n) => (n > 1 ? "curries along the top" : "a curry along the top"),
  Roti: () => "roti along the top",
  Snacks: () => "snacks along the top",
  Tiffin: () => "tiffin by the edge",
  Meals: () => "meals in the middle",
  Rice: () => "rice in the middle",
  Biryani: () => "biryani in the middle",
  Sweets: (n) => (n > 1 ? "sweets at the end" : "a sweet at the end"),
};
const SERVING_ORDER: Course[] = ["Pickles", "Curries", "Roti", "Snacks", "Tiffin", "Meals", "Rice", "Biryani", "Sweets"];

/** "Your leaf: a curry along the top, meals in the middle." in serving order, naming what stays off the leaf. */
export function leafCaption(courses: readonly Course[], hidden = 0): string {
  const parts = SERVING_ORDER.filter((course) => courses.includes(course)).map((course) =>
    PLACE[course](courses.filter((c) => c === course).length),
  );
  if (hidden > 0) parts.push(`${hidden} more in the list below`);
  return `Your leaf: ${parts.join(", ")}.`;
}
