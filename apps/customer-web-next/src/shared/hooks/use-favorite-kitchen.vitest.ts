// @vitest-environment jsdom
// Synthetic kitchen ids; no backend is contacted.
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SAVED = "6b000000-0000-4000-8000-000000000001";
const OTHER = "6b000000-0000-4000-8000-000000000002";
const AT = "2026-10-10T08:00:00Z";
let assign: ReturnType<typeof vi.fn>;

function backend(write: (url: string, init: RequestInit) => Response) {
  const fetch = vi.fn(async (url: string, init: RequestInit = {}) => !init.method || init.method === "GET"
    ? Response.json({ items: [{ kitchenId: SAVED, createdAt: AT }], nextCursor: null })
    : write(url, init));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
const reads = (fetch: ReturnType<typeof backend>) => fetch.mock.calls.filter(([, init]) => !init?.method).length;

beforeEach(() => {
  vi.resetModules(); // a fresh "once per page load" store for each case
  assign = vi.fn();
  vi.stubGlobal("location", { ...window.location, pathname: "/kitchen/abc", search: "?tab=menu", assign });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useFavoriteKitchen", () => {
  it("loads the saved set once for every heart on the page", async () => {
    const fetch = backend(() => Response.json({}));
    const { useFavoriteKitchen } = await import("./use-favorite-kitchen");
    const saved = renderHook(() => useFavoriteKitchen(SAVED.toUpperCase()));
    const other = renderHook(() => useFavoriteKitchen(OTHER));
    await waitFor(() => expect(saved.result.current.saved).toBe(true));
    expect(other.result.current.saved).toBe(false);
    expect(reads(fetch)).toBe(1);
  });

  it("saves optimistically and every heart for that kitchen follows", async () => {
    let finish!: (response: Response) => void;
    const fetch = backend(() => new Promise<Response>(resolve => { finish = resolve; }) as unknown as Response);
    const { useFavoriteKitchen } = await import("./use-favorite-kitchen");
    const first = renderHook(() => useFavoriteKitchen(OTHER));
    const second = renderHook(() => useFavoriteKitchen(OTHER));
    let done!: Promise<void>;
    act(() => { done = first.result.current.toggle(); });
    await waitFor(() => expect(second.result.current).toMatchObject({ saved: true, busy: true }));
    await act(async () => { finish(Response.json({ kitchenId: OTHER, createdAt: AT })); await done; });
    expect(second.result.current).toMatchObject({ saved: true, busy: false });
    expect(fetch.mock.calls.at(-1)).toEqual([`/api/customer/favorite-kitchens/${OTHER}`, expect.objectContaining({ method: "PUT" })]);
  });

  it("rolls back when the save fails", async () => {
    backend(() => Response.json({ code: "FAVORITE_ENTITY_FAILED" }, { status: 503 }));
    const { useFavoriteKitchen } = await import("./use-favorite-kitchen");
    const heart = renderHook(() => useFavoriteKitchen(SAVED));
    await waitFor(() => expect(heart.result.current.saved).toBe(true));
    await act(() => heart.result.current.toggle());
    expect(heart.result.current).toMatchObject({ saved: true, busy: false });
    expect(assign).not.toHaveBeenCalled();
  });

  it("sends a signed-out customer to sign in and back here", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ code: "SESSION_EXPIRED" }, { status: 401 })));
    const { useFavoriteKitchen } = await import("./use-favorite-kitchen");
    const heart = renderHook(() => useFavoriteKitchen(OTHER));
    await act(() => heart.result.current.toggle());
    expect(heart.result.current.saved).toBe(false);
    expect(assign).toHaveBeenCalledWith("/sign-in?returnTo=%2Fkitchen%2Fabc%3Ftab%3Dmenu");
  });
});

describe("FavoriteKitchenHeart", () => {
  it("is a pressed toggle that never opens the card it sits in", async () => {
    backend(() => new Response(null, { status: 204 }));
    const { FavoriteKitchenHeart } = await import("@/shared/ui/buttons/FavoriteKitchenHeart");
    const open = vi.fn();
    render(createElement("a", { href: "/kitchen/abc", onClick: open }, createElement(FavoriteKitchenHeart, { kitchenId: SAVED, kitchenName: "Asha's Kitchen" })));
    const heart = await screen.findByRole("button", { name: "Remove Asha's Kitchen from saved" });
    expect(heart.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(heart);
    expect(open).not.toHaveBeenCalled();
    const unsaved = await screen.findByRole("button", { name: "Save Asha's Kitchen" });
    await waitFor(() => expect(unsaved.hasAttribute("disabled")).toBe(false));
    expect(unsaved.getAttribute("aria-pressed")).toBe("false");
  });
});
