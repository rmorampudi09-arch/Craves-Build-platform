// @vitest-environment jsdom
// The one scroll-direction controller behind the header, compact search bar, rail and tab bar.
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  holdScrollChrome,
  resetScrollChrome,
  useScrollChrome,
} from "@/shared/components/navigation/AutoHideCustomerHeader";

function scrollTo(y: number) {
  Object.defineProperty(window, "scrollY", { configurable: true, value: y });
  window.dispatchEvent(new Event("scroll"));
  vi.advanceTimersByTime(16);
}

function scrollThrough(from: number, to: number, step: number) {
  for (let y = from; step > 0 ? y <= to : y >= to; y += step) scrollTo(y);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "setTimeout"] });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
  scrollTo(0);
  resetScrollChrome();
});
afterEach(() => vi.useRealTimers());

describe("scroll chrome controller", () => {
  it("hides after scrolling down past 96 px and shows the compact bar 6 px into an upward scroll", () => {
    const { result } = renderHook(() => useScrollChrome());
    act(() => scrollThrough(0, 90, 15));
    expect(result.current).toEqual({ hidden: false, compact: false });
    act(() => scrollThrough(105, 390, 15));
    expect(result.current).toEqual({ hidden: true, compact: false });
    act(() => scrollTo(386));
    expect(result.current.hidden).toBe(true);
    act(() => scrollTo(384));
    expect(result.current).toEqual({ hidden: false, compact: true });
    act(() => scrollThrough(380, 30, -50));
    expect(result.current).toEqual({ hidden: false, compact: false });
  });

  it("ignores programmatic jumps larger than the viewport and held programmatic scrolls", () => {
    const { result } = renderHook(() => useScrollChrome());
    act(() => scrollThrough(0, 300, 20));
    act(() => scrollThrough(290, 250, -10));
    expect(result.current).toEqual({ hidden: false, compact: true });
    act(() => scrollTo(4000));
    expect(result.current).toEqual({ hidden: false, compact: true });
    act(() => {
      holdScrollChrome();
      scrollThrough(4020, 4300, 20);
    });
    expect(result.current).toEqual({ hidden: false, compact: true });
  });

  it("always shows chrome back at the top of the page", () => {
    const { result } = renderHook(() => useScrollChrome());
    act(() => scrollThrough(0, 600, 30));
    expect(result.current.hidden).toBe(true);
    act(() => scrollTo(10));
    expect(result.current).toEqual({ hidden: false, compact: false });
  });
});
