import { useEffect, useRef } from "react";

/** The same-page path a click on this link would open, or null when it leaves the page some other way or stays. */
export function leavingHref(event: MouseEvent, location: Location): string | null {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
  if (!(link instanceof HTMLAnchorElement) || (link.target && link.target !== "_self") || link.hasAttribute("download")) return null;
  const url = new URL(link.href, location.href);
  // Another site opens on its own; a link to this same page (the skip link, #chef-hours) doesn't leave it.
  if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * While `unsaved` is true: closing or reloading the tab asks through the browser's own prompt, and a tap on a
 * link to another chef page is held back and handed to `onLeave`, which asks the chef first (app 1.31.0
 * "Leave without saving?"). The link's click is stopped before the page's own handlers see it.
 */
export function useLeaveGuard(unsaved: boolean, onLeave: (href: string) => void) {
  const ask = useRef(onLeave);
  useEffect(() => {
    ask.current = onLeave;
  });
  useEffect(() => {
    if (!unsaved) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Older browsers show their prompt only when this is set.
      event.returnValue = "";
    };
    const click = (event: MouseEvent) => {
      const href = leavingHref(event, window.location);
      if (!href) return;
      event.preventDefault();
      event.stopPropagation();
      ask.current(href);
    };
    window.addEventListener("beforeunload", beforeUnload);
    // Capture on the document runs before Next's Link (React listens lower down, at its root).
    document.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", click, true);
    };
  }, [unsaved]);
}
