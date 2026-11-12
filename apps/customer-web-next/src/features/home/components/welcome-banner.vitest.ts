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
import { WelcomeBanner } from "./WelcomeBanner";

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

const tick = (ms: number) => act(() => vi.advanceTimersByTime(ms));

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

  it("names each banner by its label and opens search on a tap", async () => {
    const { container, onOpenSearch } = await show([banner(1), banner(2)]);
    expect(screen.getByRole("button", { name: "Offer 1" })).toBeTruthy();
    expect(container.querySelectorAll("section > div:first-child > button")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Offer 2" }));
    expect(onOpenSearch).toHaveBeenCalledOnce();
  });

  it("never moves on its own and has no pause or play button", async () => {
    const { scrollTo } = await show([banner(1), banner(2), banner(3)]);
    tick(60_000);
    expect(scrollTo).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /pause|play/i })).toBeNull();
  });

  it("a dot slides to its banner, and a swipe moves the current dot", async () => {
    const { strip, scrollTo } = await show([banner(1), banner(2), banner(3)]);
    const dot = (n: number) => screen.getByRole("button", { name: `Show banner ${n} of 3` });
    expect(dot(1).getAttribute("aria-current")).toBe("true");
    fireEvent.click(dot(3));
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 600, behavior: "smooth" });
    strip!.scrollLeft = 300;
    fireEvent.scroll(strip!);
    expect(dot(2).getAttribute("aria-current")).toBe("true");
    expect(dot(1).getAttribute("aria-current")).toBeNull();
  });

  it("jumps without sliding for reduced motion", async () => {
    mocks.reduceMotion = true;
    const { scrollTo } = await show([banner(1), banner(2)]);
    fireEvent.click(screen.getByRole("button", { name: "Show banner 2 of 2" }));
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 300, behavior: "instant" });
  });

  it("drops a banner whose image fails, and the section when none are left", async () => {
    const { container } = await show([banner(1)]);
    fireEvent.error(container.querySelector("img")!);
    expect(container.innerHTML).toBe("");
  });
});
