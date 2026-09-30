"use client";

import { type MouseEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import {
  consumeReturnRoute,
  type CustomerReturnRoute,
} from "@/lib/return-navigation";

interface ContextualBackBoundaryProps {
  destination: string;
  fallback?: CustomerReturnRoute;
  children: ReactNode;
}

export function ContextualBackBoundary({
  destination,
  fallback = "/profile",
  children,
}: ContextualBackBoundaryProps) {
  const router = useRouter();

  function handleClickCapture(event: MouseEvent<HTMLDivElement>) {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const anchor = target.closest("a");
    if (!anchor) return;

    const href = anchor.getAttribute("href");
    const label = anchor.getAttribute("aria-label") ?? "";
    const isBackControl =
      anchor.getAttribute("data-contextual-back") === "true" ||
      /^Back\b/i.test(label) ||
      (anchor.textContent ?? "").trim().startsWith("←");

    if (
      !isBackControl ||
      (href !== "/profile" && href !== "/home" && href !== "/")
    ) {
      return;
    }

    const returnTo = consumeReturnRoute(destination, fallback);
    if (returnTo === href) return;

    event.preventDefault();
    event.stopPropagation();
    router.push(returnTo);
  }

  return <div onClickCapture={handleClickCapture}>{children}</div>;
}

export default ContextualBackBoundary;
