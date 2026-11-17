// @vitest-environment jsdom
import { createElement } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HoverLabels, hoverLabelFor } from "./HoverLabels";

beforeEach(() => {
  vi.useFakeTimers();
  // A desktop with a mouse; jsdom has no matchMedia of its own.
  window.matchMedia = ((query: string) => ({ matches: true, media: query })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

function hover(element: Element, pointerType = "mouse") {
  const event = new Event("pointerover", { bubbles: true });
  Object.assign(event, { pointerType });
  act(() => {
    element.dispatchEvent(event);
    vi.advanceTimersByTime(300);
  });
}

const shownLabel = () => document.querySelector("[data-hover-label]");

describe("hover labels on desktop", () => {
  it("names an icon-only button in a styled label that screen readers skip", () => {
    render(createElement(HoverLabels));
    document.body.insertAdjacentHTML("beforeend", '<button aria-label="Open your orders"><svg aria-hidden="true"></svg></button>');
    hover(document.querySelector("button")!);
    expect(shownLabel()?.textContent).toBe("Open your orders");
    expect(shownLabel()?.getAttribute("aria-hidden")).toBe("true");
  });

  it("leaves buttons that show their own words alone", () => {
    vi.spyOn(Element.prototype, "getClientRects").mockReturnValue({ length: 1 } as unknown as DOMRectList);
    render(createElement(HoverLabels));
    document.body.insertAdjacentHTML("beforeend", "<button>Choose plan</button>");
    hover(document.querySelector("button")!);
    expect(shownLabel()).toBeNull();
    expect(hoverLabelFor(document.querySelector("button")!)).toBeNull();
  });

  it("takes over from the browser's own tooltip, keeping the name for screen readers", () => {
    render(createElement(HoverLabels));
    document.body.insertAdjacentHTML("beforeend", '<a href="/settings" title="Settings"><svg aria-hidden="true"></svg></a>');
    const link = document.querySelector("a")!;
    hover(link);
    expect(shownLabel()?.textContent).toBe("Settings");
    expect(link.hasAttribute("title")).toBe(false);
    expect(link.getAttribute("aria-label")).toBe("Settings");
  });

  it("stays while something else on the page scrolls, and goes when the page itself scrolls", () => {
    render(createElement(HoverLabels));
    document.body.insertAdjacentHTML("beforeend", '<div id="strip"></div><button aria-label="Open your orders"><svg aria-hidden="true"></svg></button>');
    hover(document.querySelector("button")!);
    act(() => {
      document.getElementById("strip")!.dispatchEvent(new Event("scroll"));
    });
    expect(shownLabel()?.textContent).toBe("Open your orders");
    act(() => {
      document.dispatchEvent(new Event("scroll"));
    });
    expect(shownLabel()).toBeNull();
  });

  it("never shows for a finger, and goes away on a press", () => {
    render(createElement(HoverLabels));
    document.body.insertAdjacentHTML("beforeend", '<button aria-label="Close"><svg aria-hidden="true"></svg></button>');
    const button = document.querySelector("button")!;
    hover(button, "touch");
    expect(shownLabel()).toBeNull();
    hover(button);
    expect(shownLabel()).not.toBeNull();
    act(() => {
      document.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });
    expect(shownLabel()).toBeNull();
  });
});
