"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { leafGeometry } from "@/shared/ui/banana-leaf/leaf-geometry";
import { LeafLayers, PALE_LEAF, useSvgId, WaterDrop } from "@/shared/ui/banana-leaf/LeafDrawing";
import { courseOf, fitOnLeaf, PLATE_SHAPE } from "@/shared/ui/banana-leaf/leaf-plate";
import { leafSerif } from "@/shared/fonts/theme-fonts";
import type { CustomerOrder } from "@/features/orders/lib/order-contract";
import styles from "./PaidParcel.module.css";

const W = 300;
const H = 150;
const GEOMETRY = leafGeometry(W, H, PLATE_SHAPE);
/** Where the folded leaf lands and the parcel sits, in leaf px (the fold keyframes end here). */
const CENTRE = { x: 168, y: 77.5 };
/** The cover lifts at 2.55 s and is gone by 2.97 s. */
export const PAID_PARCEL_MS = 3000;
const seenKey = (orderId: string) => `craves.paid-parcel.${orderId}`;

/** Whether this tab already showed the parcel for this order: a reload or Back shows the page at once. */
export function paidParcelShown(orderId: string): boolean {
  try {
    return typeof window !== "undefined" && window.sessionStorage.getItem(seenKey(orderId)) === "1";
  } catch {
    return false;
  }
}

/**
 * Right after payment: the order's dishes on the banana leaf from the cart, the leaf folds into a parcel, a thread ties
 * it, then "Paid ₹…, sent to <kitchen>", and the cover lifts off the live order page. Decorative (the page under it
 * says the same), about 3 s, once per order in this tab. The caller skips it for reduced motion.
 */
export function PaidParcel({
  order,
  amount,
  photos,
  onDone,
}: {
  order: Pick<CustomerOrder, "id" | "items" | "kitchenName">;
  /** The paid total, formatted. */
  amount: string;
  /** Dish photos by menu item; a dish without one sits on the leaf as a plain plate. */
  photos: Map<string, string>;
  onDone: () => void;
}) {
  const id = useSvgId("parcel");
  // The food is the point: wait for the dish photos (they come with the kitchen's menu), never more than 0.7 s.
  const [started, setStarted] = useState(photos.size > 0);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(seenKey(order.id), "1");
    } catch {
      // Storage blocked: it may play again on a reload, nothing worse.
    }
  }, [order.id]);

  useEffect(() => {
    if (started) return;
    if (photos.size > 0) {
      setStarted(true);
      return;
    }
    const timer = window.setTimeout(() => setStarted(true), 700);
    return () => window.clearTimeout(timer);
  }, [started, photos.size]);

  useEffect(() => {
    if (!started) return;
    const timer = window.setTimeout(onDone, PAID_PARCEL_MS);
    return () => window.clearTimeout(timer);
  }, [started, onDone]);

  const layout = fitOnLeaf(
    order.items.map((item) => ({ key: item.id, course: courseOf(item.category) })),
    GEOMETRY,
    { base: 44 },
  );
  const lines = new Map(order.items.map((item) => [item.id, item]));

  if (!started) return <div aria-hidden="true" className={styles.cover} />;

  return (
    <div className={`${leafSerif.variable} ${styles.over}`} aria-hidden="true">
      <svg viewBox={`0 0 ${W} ${H}`} className={styles.art}>
        <defs>
          <linearGradient id={`${id}-shade`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#22553A" stopOpacity="0" />
            <stop offset="1" stopColor="#22553A" stopOpacity="0.85" />
          </linearGradient>
          <clipPath id={`${id}-parcel`}>
            <rect x="99" y="39" width="138" height="77" rx="16" />
          </clipPath>
          {layout.dishes.map((dish, index) => (
            <clipPath key={dish.key} id={`${id}-dish${index}`}>
              <circle cx={dish.x} cy={dish.y} r={dish.size / 2 - 2} />
            </clipPath>
          ))}
        </defs>

        <g className={styles.leaf}>
          <LeafLayers geometry={GEOMETRY} palette={PALE_LEAF}>
            {layout.drops.map(([x, y, r]) => (
              <WaterDrop key={x} x={x} y={y} r={r} />
            ))}
          </LeafLayers>
          <path d={GEOMETRY.blade} fill={`url(#${id}-shade)`} className={styles.shade} />
        </g>

        {layout.dishes.map((dish, index) => {
          const line = lines.get(dish.key);
          const photo = line ? photos.get(line.menuItemId) : undefined;
          const r = dish.size / 2;
          const shift = { "--dx": `${CENTRE.x - dish.x}px`, "--dy": `${CENTRE.y - dish.y}px` } as CSSProperties;
          return (
            <g key={dish.key} className={styles.dish} style={shift}>
              <circle cx={dish.x} cy={dish.y} r={r} fill="#FFFFFF" stroke="#CFE3C2" />
              {photo ? (
                <image
                  href={photo}
                  x={dish.x - r + 2}
                  y={dish.y - r + 2}
                  width={dish.size - 4}
                  height={dish.size - 4}
                  clipPath={`url(#${id}-dish${index})`}
                  preserveAspectRatio="xMidYMid slice"
                />
              ) : (
                <circle cx={dish.x} cy={dish.y} r={r - 6} fill="#EAF3E2" />
              )}
              {line ? (
                <g transform={`translate(${dish.x + r * 0.35} ${dish.y + r * 0.55})`}>
                  <rect width="22" height="13" rx="6.5" fill="#22553A" stroke="#FFFFFF" strokeWidth="1.5" />
                  <text x="11" y="9.6" fontSize="8.5" fontWeight="700" fill="#FFFFFF" textAnchor="middle">
                    × {line.quantity}
                  </text>
                </g>
              ) : null}
            </g>
          );
        })}

        <g className={styles.parcel}>
          <rect x="99" y="39" width="138" height="77" rx="16" fill="#CFE4BF" stroke="#22553A" strokeWidth="2" />
          <g clipPath={`url(#${id}-parcel)`} fill="none" stroke="#B8D5A3" strokeWidth="1.2" strokeLinecap="round">
            <path d="M95 64 Q150 54 241 70" />
            <path d="M95 88 Q160 78 241 95" />
            <path d="M95 107 Q160 99 241 113" />
          </g>
          <path d="M103 42 L168 84 L233 42 Z" fill="#DFEDD2" stroke="#4F8A3C" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M168 84 L168 115" stroke="#4F8A3C" strokeWidth="1.2" opacity="0.6" />
        </g>

        <g fill="none" stroke="#9C6B33" strokeWidth="2.4" strokeLinecap="round">
          <path className={styles.string} pathLength={1} d="M94 80 C130 83 206 83 242 80" />
          <path className={`${styles.string} ${styles.down}`} pathLength={1} d="M168 33 C171 58 171 98 168 121" />
          <g className={styles.knot}>
            <path d="M168 81 c-11 -11 -19 -2 -10 4.5 z M168 81 c11 -11 19 -2 10 4.5 z" strokeWidth="2" />
            <circle cx="168" cy="81" r="3.6" fill="#9C6B33" stroke="none" />
          </g>
        </g>

        <g className={styles.tick}>
          <circle cx="235" cy="41" r="15" fill="#F62E18" stroke="#FFFFFF" strokeWidth="3" />
          <path
            className={styles.check}
            pathLength={1}
            d="M228.5 41.5 l5 5 l8.5 -9.5"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      </svg>

      <p className={styles.paid}>
        <strong>Paid {amount}</strong>
        <span>Sent to {order.kitchenName}</span>
      </p>
    </div>
  );
}

export default PaidParcel;
