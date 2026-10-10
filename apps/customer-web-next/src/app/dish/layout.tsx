import type { Metadata } from "next";
import type { ReactNode } from "react";

// Dish data loads in the browser; a server title would need a new API call.
export const metadata: Metadata = { title: "Dish details | Craves" };

export default function DishLayout({ children }: { children: ReactNode }) {
  return children;
}
