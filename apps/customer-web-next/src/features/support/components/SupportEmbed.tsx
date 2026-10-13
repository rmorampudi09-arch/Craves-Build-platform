"use client";

import { useEffect } from "react";
import { useSupportRole } from "./SupportLauncher";
import { SupportChat } from "./SupportChat";

/** The chat alone, filling its frame: the static landing page shows it in its own "Ask Craves" panel. */
export function SupportEmbed() {
  const role = useSupportRole("/", true);
  useEffect(() => {
    // Other Craves pages refuse to be framed, so a link in the chat opens in the whole tab instead.
    const onClick = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target || anchor.origin !== window.location.origin || window.top === window) return;
      event.preventDefault();
      event.stopPropagation();
      window.top!.location.href = anchor.href;
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  return <SupportChat key={role} contextRole={role} />;
}
