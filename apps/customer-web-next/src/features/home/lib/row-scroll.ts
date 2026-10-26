import { useEffect, useState } from "react";

const EDGE_TOLERANCE_PX = 18;

/** Whether a horizontal row has more to the left or right (drives its arrows and edge fades). */
export function useRowEdges(row: HTMLElement | null) {
  const [edges, setEdges] = useState({ left: false, right: false });
  useEffect(() => {
    if (!row) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const max = Math.max(0, row.scrollWidth - row.clientWidth);
      const position = Math.min(max, Math.max(0, row.scrollLeft));
      setEdges((current) => {
        const next = { left: position > EDGE_TOLERANCE_PX, right: position < max - EDGE_TOLERANCE_PX };
        return current.left === next.left && current.right === next.right ? current : next;
      });
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(row);
    update();
    row.addEventListener("scroll", schedule, { passive: true });
    return () => {
      row.removeEventListener("scroll", schedule);
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [row]);
  return edges;
}

/** Moves a row one step left or right (most of its width by default), landing on an edge when close. */
export function scrollRow(row: HTMLElement | null, direction: -1 | 1, step?: number) {
  if (!row) return;
  const max = Math.max(0, row.scrollWidth - row.clientWidth);
  const distance = step ?? Math.max(260, row.clientWidth * 0.68);
  const raw = Math.min(max, Math.max(0, row.scrollLeft + direction * distance));
  row.scrollTo({
    left: raw <= EDGE_TOLERANCE_PX ? 0 : raw >= max - EDGE_TOLERANCE_PX ? max : raw,
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
  });
}
