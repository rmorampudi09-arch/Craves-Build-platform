import type { Metadata } from "next";
import type { ReactNode } from "react";

// Kitchen data loads in the browser; a server title would need a new API call.
export const metadata: Metadata = { title: "Home kitchen | Craves" };

export default function KitchensLayout({ children }: { children: ReactNode }) {
  return children;
}
