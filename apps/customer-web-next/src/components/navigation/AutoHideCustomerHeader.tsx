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
  const framePending = useRef(false);

  useEffect(() => {
    lastScrollY.current = Math.max(window.scrollY, 0);
    lastViewportWidth.current = window.innerWidth;

    const updateFromScroll = () => {
      const currentY = Math.max(window.scrollY, 0);
      const delta = currentY - lastScrollY.current;

      if (currentY <= TOP_REVEAL_PX) {
        setHidden(false);
      } else if (currentY > HIDE_AFTER_PX && delta > HIDE_DELTA_PX) {
        setHidden(true);
      } else if (delta < -SHOW_DELTA_PX) {
        setHidden(false);
      }

      lastScrollY.current = currentY;
      framePending.current = false;
    };

    const handleScroll = () => {
      if (framePending.current) return;
      framePending.current = true;
      window.requestAnimationFrame(updateFromScroll);
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
        "will-change-transform transition-transform duration-[300ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
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
