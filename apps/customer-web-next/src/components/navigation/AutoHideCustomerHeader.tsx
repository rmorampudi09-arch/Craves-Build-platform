"use client";

import {
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

const TOP_REVEAL_PX = 24;
const HIDE_AFTER_PX = 96;
const HIDE_DELTA_PX = 10;
const SHOW_DELTA_PX = 6;

interface AutoHideCustomerHeaderProps {
  children: ReactNode;
  className?: string;
  mobileStatic?: boolean;
}

export function AutoHideCustomerHeader({
  children,
  className = "",
  mobileStatic = false,
}: AutoHideCustomerHeaderProps) {
  const [hidden, setHidden] = useState(false);
  const lastScrollY = useRef(0);
  const lastViewportWidth = useRef(0);
  const framePending = useRef(0);
  const directionAnchor = useRef(0);
  const lastDirection = useRef<"up" | "down" | null>(null);

  useEffect(() => {
    lastScrollY.current = Math.max(window.scrollY, 0);
    lastViewportWidth.current = window.innerWidth;
    directionAnchor.current = lastScrollY.current;

    const updateFromScroll = () => {
      const currentY = Math.max(window.scrollY, 0);
      const delta = currentY - lastScrollY.current;

      const direction = delta > 0 ? "down" : delta < 0 ? "up" : null;
      if (direction && direction !== lastDirection.current) {
        directionAnchor.current = lastScrollY.current;
        lastDirection.current = direction;
      }
      const travel = Math.abs(currentY - directionAnchor.current);
      if (currentY <= TOP_REVEAL_PX) {
        setHidden(false);
        directionAnchor.current = currentY;
      } else if (currentY > HIDE_AFTER_PX && direction === "down" && travel >= HIDE_DELTA_PX) {
        setHidden(true);
      } else if (direction === "up" && travel >= SHOW_DELTA_PX) {
        setHidden(false);
      }

      lastScrollY.current = currentY;
      framePending.current = 0;
    };

    const handleScroll = () => {
      if (framePending.current) return;
      framePending.current = window.requestAnimationFrame(updateFromScroll);
    };

    const handleResize = () => {
      const nextWidth = window.innerWidth;
      if (nextWidth === lastViewportWidth.current) return;

      lastViewportWidth.current = nextWidth;
      lastScrollY.current = Math.max(window.scrollY, 0);
      setHidden(false);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleResize);
      if (framePending.current) window.cancelAnimationFrame(framePending.current);
    };
  }, []);

  const positionClass = mobileStatic
    ? "static md:sticky md:top-0"
    : "sticky top-0";

  const visibilityClass = mobileStatic
    ? hidden
      ? "translate-y-0 md:-translate-y-full md:pointer-events-none"
      : "translate-y-0"
    : hidden
      ? "-translate-y-full pointer-events-none"
      : "translate-y-0";

  useEffect(() => {
    if (!mobileStatic) return;

    const root = document.documentElement;
    root.style.setProperty(
      "--craves-desktop-header-offset-md",
      hidden ? "0px" : "4.25rem",
    );
    root.style.setProperty(
      "--craves-desktop-header-offset-lg",
      hidden ? "0px" : "4.65rem",
    );

    return () => {
      root.style.removeProperty("--craves-desktop-header-offset-md");
      root.style.removeProperty("--craves-desktop-header-offset-lg");
    };
  }, [hidden, mobileStatic]);

  return (
    <header
      data-craves-auto-hide-header="true"
      data-header-state={hidden ? "hidden" : "visible"}
      data-mobile-static={mobileStatic ? "true" : "false"}
      onFocusCapture={() => setHidden(false)}
      className={[
        positionClass,
        "z-40",
        "will-change-transform transition-transform duration-[260ms] ease-[cubic-bezier(0.23,0.88,0.26,0.92)]",
        "motion-reduce:transition-none",
        visibilityClass,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </header>
  );
}

export default AutoHideCustomerHeader;
