// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ banners: vi.fn(), reduceMotion: false }));
vi.mock("@/features/home/api/home-banners", () => ({ fetchHomeBanners: mocks.banners }));
vi.mock("framer-motion", async (original) => ({
  ...(await original<typeof import("framer-motion")>()),
  useReducedMotion: () => mocks.reduceMotion,
}));
import { BANNER_ADVANCE_MS, WelcomeBanner } from "./WelcomeBanner";

const banner = (n: number) => ({
  id: `6212c931-b8ac-4cc7-8cf6-3a967204600${n}`,
  label: `Offer ${n}`,
  src: `/api/catalog/banners/6212c931-b8ac-4cc7-8cf6-3a967204600${n}/image`,
});

async function show(banners: ReturnType<typeof banner>[], onOpenSearch = vi.fn()) {
  mocks.banners.mockResolvedValue(banners);
  const view = render(createElement(WelcomeBanner, { onOpenSearch }));
  await act(async () => {});
  const strip = view.container.querySelector<HTMLElement>("section > div");
  const scrollTo = vi.fn();
  if (strip) {
    Object.defineProperty(strip, "clientWidth", { configurable: true, value: 300 });
    strip.scrollTo = scrollTo as unknown as HTMLElement["scrollTo"];
  }
  return { ...view, strip, scrollTo, onOpenSearch };
}

const tick = (ms = BANNER_ADVANCE_MS) => act(() => vi.advanceTimersByTime(ms));

beforeEach(() => {
  mocks.banners.mockReset();
  mocks.reduceMotion = false;
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
});

describe("Home promo banners", () => {
  it("shows nothing while loading or when there are no banners", async () => {
    mocks.banners.mockReturnValue(new Promise(() => undefined));
    const loading = render(createElement(WelcomeBanner, { onOpenSearch: vi.fn() }));
    expect(loading.container.innerHTML).toBe("");
    cleanup();
    const { container } = await show([]);
    expect(container.innerHTML).toBe("");
  });

  it("names each banner by its label, loops onto a hidden copy and opens search on a tap", async () => {
    const { container, onOpenSearch } = await show([banner(1), banner(2)]);
    expect(screen.getByRole("button", { name: "Offer 1" })).toBeTruthy();
    const slides = container.querySelectorAll("section > div:first-child > button");
    expect(slides).toHaveLength(3);
    const copy = slides[2];
    expect([copy.getAttribute("aria-hidden"), copy.getAttribute("tabindex")]).toEqual([
      "true",
      "-1",
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Offer 2" }));
    expect(onOpenSearch).toHaveBeenCalledOnce();
  });

  it("slides every 4 s, and a swipe holds its banner for one full interval", async () => {
    const { strip, scrollTo } = await show([banner(1), banner(2), banner(3)]);
    expect(screen.getByText("Banner 1 of 3")).toBeTruthy();
    tick();
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 300, behavior: "smooth" });
    strip!.scrollLeft = 300;
    fireEvent.scroll(strip!);
    expect(screen.getByText("Banner 2 of 3")).toBeTruthy();
    tick(BANNER_ADVANCE_MS / 2);
    fireEvent.touchEnd(strip!);
    tick(BANNER_ADVANCE_MS / 2);
    expect(scrollTo).toHaveBeenCalledTimes(1);
    tick();
    expect(scrollTo).toHaveBeenCalledTimes(2);
  });

  it("steps from the copy back to the real first banner once a slide settles", async () => {
    const { strip, scrollTo } = await show([banner(1), banner(2)]);
    strip!.scrollLeft = 600;
    fireEvent.scroll(strip!);
    tick(140);
    expect(scrollTo).toHaveBeenCalledWith({ left: 0, behavior: "instant" });
  });

  it("stops while the tab is hidden or the customer paused it", async () => {
    const { scrollTo } = await show([banner(1), banner(2)]);
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    tick(3 * BANNER_ADVANCE_MS);
    expect(scrollTo).not.toHaveBeenCalled();
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    fireEvent.click(screen.getByRole("button", { name: "Pause banners" }));
    tick(3 * BANNER_ADVANCE_MS);
    expect(scrollTo).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Play banners" })).toBeTruthy();
  });

  it("starts again when Play is pressed, though focus stays on the button", async () => {
    const { scrollTo } = await show([banner(1), banner(2)]);
    fireEvent.click(screen.getByRole("button", { name: "Pause banners" }));
    const play = screen.getByRole("button", { name: "Play banners" });
    play.focus();
    fireEvent.click(play);
    tick();
    expect(scrollTo).toHaveBeenCalledOnce();
  });

  it("never moves for reduced motion", async () => {
    mocks.reduceMotion = true;
    const { scrollTo } = await show([banner(1), banner(2)]);
    tick(3 * BANNER_ADVANCE_MS);
    expect(scrollTo).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Pause banners" })).toBeNull();
  });

  it("drops a banner whose image fails, and the section when none are left", async () => {
    const { container } = await show([banner(1)]);
    fireEvent.error(container.querySelector("img")!);
    expect(container.innerHTML).toBe("");
  });
});
