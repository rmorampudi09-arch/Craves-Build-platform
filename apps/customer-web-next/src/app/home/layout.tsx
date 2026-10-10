import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "Home | Craves" };

export default function HomeLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {/* The browse screen has no visible page title; this gives the page its one h1. */}
      <h1 className="sr-only">Home-cooked food near you</h1>
      {children}
    </>
  );
}
