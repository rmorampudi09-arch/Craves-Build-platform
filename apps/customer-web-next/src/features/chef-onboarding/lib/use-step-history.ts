"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

/**
 * Mirrors a multi-step form's step in ?step= so browser Back and Forward walk through the steps.
 * The form keeps its own step state; onBrowserStep runs only when the URL step changes without the
 * form asking (Back, Forward or a typed URL). null means the bare page URL.
 */
export function useStepHistory(onBrowserStep: (step: string | null) => void) {
  const router = useRouter();
  const pathname = usePathname();
  const urlStep = useSearchParams().get("step");
  const shown = useRef(urlStep);
  const handler = useRef(onBrowserStep);
  const navigation = useRef({ router, pathname });
  useEffect(() => {
    handler.current = onBrowserStep;
    navigation.current = { router, pathname };
  });
  useEffect(() => {
    if (urlStep === shown.current) return;
    shown.current = urlStep;
    handler.current(urlStep);
  }, [urlStep]);

  // Stable, so callers can list it as a dependency without re-running their effects.
  const showStep = useCallback((step: string | null, replace = false) => {
    if (step === shown.current) return;
    shown.current = step;
    const { router, pathname } = navigation.current;
    const href = step ? `${pathname}?step=${encodeURIComponent(step)}` : pathname;
    if (replace) router.replace(href, { scroll: false });
    else router.push(href, { scroll: false });
  }, []);
  return { urlStep, showStep };
}
