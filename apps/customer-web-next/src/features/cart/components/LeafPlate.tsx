"use client";

import { useMemo } from "react";
import { leafGeometry } from "@/shared/ui/banana-leaf/leaf-geometry";
import { LeafLayers, PALE_LEAF, WaterDrop } from "@/shared/ui/banana-leaf/LeafDrawing";
import { fitOnLeaf, leafCaption, PLATE_SHAPE, type Course } from "@/shared/ui/banana-leaf/leaf-plate";

const W = 300;
const H = 150;
const GEOMETRY = leafGeometry(W, H, PLATE_SHAPE);
const pct = (value: number, of: number) => `${(value / of) * 100}%`;

export type LeafPlateDish = { key: string; course: Course; img: string; qty: number };

/**
 * The cart as it would be served on a banana leaf: each dish's photo at its place by serving order, its count on the
 * photo, and one line saying where things sit. The list under it carries the names and controls, so the leaf is
 * decorative for screen readers; the caption is read.
 */
export function LeafPlate({ dishes, className }: { dishes: LeafPlateDish[]; className?: string }) {
  const layout = useMemo(() => fitOnLeaf(dishes.map(({ key, course }) => ({ key, course })), GEOMETRY, { base: 44 }), [dishes]);
  const byKey = new Map(dishes.map((dish) => [dish.key, dish]));
  return (
    <figure className={className}>
      <div aria-hidden="true" className="relative mx-auto w-full max-w-[300px] md:max-w-[440px]" style={{ aspectRatio: `${W} / ${H}` }}>
        <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full overflow-visible">
          <LeafLayers geometry={GEOMETRY} palette={PALE_LEAF}>
            {layout.drops.map(([x, y, r]) => (
              <WaterDrop key={x} x={x} y={y} r={r} />
            ))}
          </LeafLayers>
        </svg>
        {layout.dishes.map((placed) => {
          const dish = byKey.get(placed.key);
          if (!dish) return null;
          return (
            <span
              key={placed.key}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: pct(placed.x, W), top: pct(placed.y, H), width: pct(placed.size, W), aspectRatio: "1" }}
            >
              <span className="block h-full w-full rounded-full border border-[#CFE3C2] bg-white p-[2px]">
                <img src={dish.img} alt="" loading="lazy" decoding="async" className="h-full w-full rounded-full object-cover" />
              </span>
              <span className="absolute -bottom-1.5 -right-2.5 min-w-[1.875rem] rounded-full border-2 border-white bg-[#22553A] px-1.5 text-center text-[0.8125rem] font-bold leading-5 text-white tabular-nums">
                × {dish.qty}
              </span>
            </span>
          );
        })}
      </div>
      <figcaption className="mt-2.5 text-balance px-4 text-center font-[family-name:var(--font-leaf)] text-base italic leading-snug text-[#22553A]">
        {leafCaption(layout.dishes.map((dish) => dish.course), layout.hidden)}
      </figcaption>
    </figure>
  );
}

export default LeafPlate;
