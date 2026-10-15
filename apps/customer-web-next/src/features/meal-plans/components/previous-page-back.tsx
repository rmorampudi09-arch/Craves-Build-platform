"use client";

import type { MouseEvent, ReactNode } from "react";

type NavigationLike = { currentEntry?: { index: number } | null };

/**
 * The page's back link goes back to the Craves page the customer came from (Help or meal plans), like
 * the app. Only the Navigation API can tell that the previous entry is ours; without it the link's href is used.
 */
export function PreviousPageBack({ children }: { children: ReactNode }) {
  function onClickCapture(event: MouseEvent<HTMLDivElement>) {
    const back = event.target instanceof Element ? event.target.closest('a[aria-label^="Back"]') : null;
    const navigation = (window as { navigation?: NavigationLike }).navigation;
    if (!back || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (!navigation?.currentEntry || navigation.currentEntry.index < 1) return;
    event.preventDefault();
    window.history.back();
  }
  return <div onClickCapture={onClickCapture}>{children}</div>;
}
