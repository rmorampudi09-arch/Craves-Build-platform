// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const replace = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));

import SearchPage from "@/app/search/page";

afterEach(() => {
  cleanup();
  replace.mockClear();
  window.sessionStorage.clear();
});

function open(url: string) {
  window.history.replaceState(null, "", url);
  render(createElement(SearchPage));
}

describe("/search", () => {
  it("opens Home search with the words from ?q=", () => {
    open("/search?q=%20chicken%20biryani%20");
    expect(window.sessionStorage.getItem("craves-home-open-search")).toBe("1");
    expect(window.sessionStorage.getItem("craves-home-search-term")).toBe("chicken biryani");
    expect(replace).toHaveBeenCalledExactlyOnceWith("/home");
    expect(screen.getByRole("main", { name: "Opening search" }).getAttribute("aria-busy")).toBe("true");
  });

  it("opens an empty search without carrying an old term, and caps long input", () => {
    window.sessionStorage.setItem("craves-home-search-term", "old words");
    open("/search");
    expect(window.sessionStorage.getItem("craves-home-open-search")).toBe("1");
    expect(window.sessionStorage.getItem("craves-home-search-term")).toBeNull();
    cleanup();

    open(`/search?q=${"a".repeat(300)}`);
    expect(window.sessionStorage.getItem("craves-home-search-term")).toHaveLength(100);
  });
});
