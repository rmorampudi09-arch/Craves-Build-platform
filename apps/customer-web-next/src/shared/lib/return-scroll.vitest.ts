// @vitest-environment jsdom
// Lists come back where the person left them after opening an item from them, and only then.
import { createElement, type MouseEvent } from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { returnToListPath, useReturnScroll } from "./return-scroll";

const KEY = "craves:return-scroll";
// jsdom doesn't navigate: the link only has to report where it goes.
const stay = (event: MouseEvent) => event.preventDefault();

function List({ ready }: { ready: boolean }) {
  const remember = useReturnScroll(ready);
  return createElement(
    "div",
    { onClickCapture: remember },
    createElement("header", null, createElement("a", { href: "/profile", onClick: stay }, "Back to profile")),
    createElement(
      "main",
      null,
      createElement("a", { href: "/orders/1", onClick: stay }, "Open order"),
      createElement("a", { href: "/orders/2", target: "_blank", onClick: stay }, "Open in new tab"),
      createElement("button", { type: "button" }, "Refresh"),
    ),
  );
}

let scrollTo: ReturnType<typeof vi.spyOn>;

/** Opens the order from a list scrolled to 640 and leaves the list. */
function openOrderFromList() {
  window.history.pushState(null, "", "/orders");
  const list = render(createElement(List, { ready: true }));
  fireEvent.click(list.getByText("Open order"));
  list.unmount();
  scrollTo.mockClear();
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/orders");
  Object.defineProperty(window, "scrollY", { value: 640, configurable: true });
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    callback(0);
    return 0;
  });
  scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("return scroll", () => {
  it("remembers only items opened from the list", () => {
    const list = render(createElement(List, { ready: true }));
    fireEvent.click(list.getByText("Refresh"));
    fireEvent.click(list.getByText("Back to profile"));
    fireEvent.click(list.getByText("Open in new tab"));
    fireEvent.click(list.getByText("Open order"), { metaKey: true });
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
    fireEvent.click(list.getByText("Open order"));
    expect(JSON.parse(window.sessionStorage.getItem(KEY)!)).toMatchObject({ path: "/orders", item: "/orders/1", y: 640 });
  });

  it("lands on the same spot on Back, once the list has rendered", () => {
    openOrderFromList();
    // Back onto the list's own (stamped) history entry.
    const back = render(createElement(List, { ready: false }));
    expect(scrollTo).not.toHaveBeenCalled();
    back.rerender(createElement(List, { ready: true }));
    expect(scrollTo).toHaveBeenCalledWith(0, 640);
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
  });

  it("lands on the same spot through the item's own back control", () => {
    openOrderFromList();
    window.history.pushState(null, "", "/orders/1");
    expect(returnToListPath()).toBe("/orders");
    window.history.pushState(null, "", "/orders");
    render(createElement(List, { ready: true }));
    expect(scrollTo).toHaveBeenCalledWith(0, 640);
  });

  it("starts a fresh visit at the top, and ignores other pages and old spots", () => {
    openOrderFromList();
    window.history.pushState(null, "", "/profile");
    expect(returnToListPath()).toBeNull();
    window.history.pushState(null, "", "/orders");
    render(createElement(List, { ready: true }));
    expect(scrollTo).not.toHaveBeenCalled();
    cleanup();

    window.sessionStorage.setItem(KEY, JSON.stringify({ path: "/orders", item: "/orders/1", y: 300, at: Date.now() - 11 * 60_000 }));
    window.history.replaceState({ cravesReturn: Date.now() - 11 * 60_000 }, "", "/orders/1");
    expect(returnToListPath()).toBeNull();
  });
});
