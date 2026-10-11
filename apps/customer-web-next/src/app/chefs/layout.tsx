import type { ReactNode } from "react";

export default function ChefsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {/* The chefs screen has no visible page title; this gives the page its one h1. */}
      <h1 className="sr-only">Home chefs near you</h1>
      {children}
    </>
  );
}
