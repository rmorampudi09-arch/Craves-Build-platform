import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "Saved | Craves" };

export default function WishlistLayout({ children }: { children: ReactNode }) {
  return children;
}
