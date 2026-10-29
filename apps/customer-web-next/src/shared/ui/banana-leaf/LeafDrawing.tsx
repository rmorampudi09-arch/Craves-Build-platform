import { useId, type ReactNode } from "react";
import type { LeafGeometry } from "./leaf-geometry";

export type LeafPalette = { fill: string; hair: string; vein: string; rim: string; rib: string; ribLine: string; outline: string };

/** The washed, pale leaf of the Banana Leaf look (cart, empty cart). */
export const PALE_LEAF: LeafPalette = {
  fill: "#DFEDD2",
  hair: "#CDE2BD",
  vein: "#B8D5A3",
  rim: "#CFE4BF",
  rib: "#4F8A3C",
  ribLine: "#8FBE77",
  outline: "#22553A",
};

/** The fresh green leaf of the "01 Banana leaf" states (offline, no meal plans). */
export const GREEN_LEAF: LeafPalette = {
  fill: "#3D8A3E",
  hair: "#4C9A4B",
  vein: "#5DA758",
  rim: "#46934A",
  rib: "#1F5A2A",
  ribLine: "#2F7A3A",
  outline: "#1F5A2A",
};

/** Where the approved mockups set water drops by the tip: [share of W, share of H, radius px]. */
export const LEAF_DROPS = [
  [0.16, 0.69, 4.6],
  [0.215, 0.78, 3.2],
  [0.27, 0.64, 3.4],
] as const;

/** A clipPath id that is safe inside url(#…): React's ids carry punctuation. */
export function useSvgId(prefix: string): string {
  return prefix + useId().replace(/[^a-zA-Z0-9_-]/g, "");
}

/** The leaf's layers: the blade, its veins clipped to it, a rim, the midrib and the outline. Decorative. */
export function LeafLayers({
  geometry: g,
  palette = PALE_LEAF,
  children,
}: {
  geometry: LeafGeometry;
  palette?: LeafPalette;
  children?: ReactNode;
}) {
  const clip = useSvgId("leaf");
  return (
    <g>
      <defs>
        <clipPath id={clip}>
          <path d={g.blade} />
        </clipPath>
      </defs>
      <path d={g.blade} fill={palette.fill} />
      <g clipPath={`url(#${clip})`} fill="none" strokeLinecap="round">
        <g stroke={palette.hair} strokeWidth={0.8}>
          {g.hairs.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
        <g stroke={palette.vein} strokeWidth={1.25}>
          {g.veins.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
        <path d={g.blade} stroke={palette.rim} strokeWidth={7} />
      </g>
      <path d={g.rib} fill={palette.rib} />
      <path d={g.ribLine} fill="none" stroke={palette.ribLine} strokeWidth={1} strokeLinecap="round" />
      <path d={g.blade} fill="none" stroke={palette.outline} strokeWidth={2} strokeLinejoin="round" />
      {children}
    </g>
  );
}

/** A water drop resting on the leaf: the leaf is washed before serving. */
export function WaterDrop({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx={0.8} cy={1.2} rx={r} ry={r * 0.86} fill="#CDE2BD" />
      <ellipse rx={r} ry={r * 0.86} fill="#F7FBF2" stroke="#A9CB93" strokeWidth={1} />
      <path
        d={`M${-r * 0.55},${-r * 0.05}A${r * 0.6} ${r * 0.55} 0 0 1 ${r * 0.05},${-r * 0.55}`}
        fill="none"
        stroke="#FFFFFF"
        strokeLinecap="round"
        strokeWidth={Math.max(1.2, r * 0.3)}
      />
    </g>
  );
}
