import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "Your cart | Craves" };

export default function CartLayout({ children }: { children: ReactNode }) {
  return children;
}
