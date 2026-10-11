// @vitest-environment jsdom
import { createElement, useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MotionGlobalConfig } from "framer-motion";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Dialog, Sheet, useOverlayHistory } from "@/shared/ui/overlays/overlay";

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterEach(cleanup);

const nextTick = () => act(() => new Promise((resolve) => setTimeout(resolve, 20)));

function Harness({ kind = "dialog", outside = true, unsaved = false }: { kind?: "dialog" | "sheet"; outside?: boolean; unsaved?: boolean }) {
  const [open, setOpen] = useState(false);
  const Overlay = kind === "sheet" ? Sheet : Dialog;
  return createElement("div", null,
    createElement("button", { type: "button", onClick: () => setOpen(true) }, "Open"),
    createElement("output", { "aria-label": "State" }, open ? "open" : "closed"),
    createElement(Overlay, {
      open,
      onOpenChange: setOpen,
      title: "Pause meal plan?",
      closeOnOutsideTap: outside,
      unsavedChanges: unsaved,
      footer: createElement("button", { type: "button", onClick: () => setOpen(false) }, "Keep plan"),
    }),
  );
}

const state = () => screen.getByLabelText("State").textContent;
const tapOutside = () => {
  fireEvent.pointerDown(document.body);
  fireEvent.click(document.body);
};

describe("customer overlays", () => {
  it("adds one history entry, closes on browser Back and keeps that popstate from the router", async () => {
    const routerPopState = vi.fn();
    window.addEventListener("popstate", routerPopState);
    render(createElement(Harness));
    const before = window.history.length;

    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(screen.getByRole("dialog", { name: "Pause meal plan?" })).toBeTruthy();
    expect(window.history.length).toBe(before + 1);
    expect((window.history.state as Record<string, unknown>).cravesOverlay).toBeTypeOf("number");

    await act(async () => {
      window.history.back();
    });
    await waitFor(() => expect(state()).toBe("closed"));
    expect(routerPopState).not.toHaveBeenCalled();
    window.removeEventListener("popstate", routerPopState);
  });

  it("pops its entry when closed by a button, and returns focus to the opener", async () => {
    const back = vi.spyOn(window.history, "back");
    render(createElement(Harness));
    const opener = screen.getByRole("button", { name: "Open" });
    opener.focus();
    fireEvent.click(opener);
    await waitFor(() => expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true));

    fireEvent.click(screen.getByRole("button", { name: "Keep plan" }));
    expect(state()).toBe("closed");
    await nextTick();
    expect(back).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(document.activeElement).toBe(opener));
    back.mockRestore();
  });

  it("takes over an entry an earlier overlay left behind instead of stacking a second one", async () => {
    // A dish opened from search, then Back: the page underneath reopens its overlay on that entry.
    window.history.pushState({ ...(window.history.state as object | null), cravesOverlay: 9_999 }, "");
    const routerPopState = vi.fn();
    window.addEventListener("popstate", routerPopState);
    render(createElement(Harness));
    const before = window.history.length;

    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(window.history.length).toBe(before);
    expect((window.history.state as Record<string, unknown>).cravesOverlay).toBe(9_999);

    await act(async () => {
      window.history.back();
    });
    await waitFor(() => expect(state()).toBe("closed"));
    expect(routerPopState).not.toHaveBeenCalled();
    window.removeEventListener("popstate", routerPopState);
  });

  it("still gives an overlay opened over another open one its own entry", async () => {
    function Probe({ open }: { open: boolean }) {
      useOverlayHistory(open, () => undefined);
      return null;
    }
    const probes = (second: boolean) =>
      createElement("div", null, createElement(Probe, { open: true }), createElement(Probe, { open: second }));
    const view = render(probes(false));
    const before = window.history.length;
    view.rerender(probes(true));
    expect(window.history.length).toBe(before + 1);
    view.unmount();
    await nextTick();
  });

  it("closes on Escape", async () => {
    render(createElement(Harness, { kind: "sheet" }));
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(state()).toBe("closed");
    await nextTick();
  });

  it("closes on an outside tap only while nothing has been typed", async () => {
    render(createElement(Harness, { outside: false }));
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    await nextTick(); // Radix starts listening for outside taps a tick after opening.
    tapOutside();
    expect(state()).toBe("open");
    fireEvent.click(screen.getByRole("button", { name: "Keep plan" }));
    await nextTick();
    cleanup();

    render(createElement(Harness));
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    await nextTick();
    tapOutside();
    expect(state()).toBe("closed");
    await nextTick();
  });

  it("asks before throwing away typed changes: Back and the close button keep the form, Discard closes it", async () => {
    const routerPopState = vi.fn();
    window.addEventListener("popstate", routerPopState);
    render(createElement(Harness, { kind: "sheet", unsaved: true }));
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    const entry = (window.history.state as Record<string, unknown>).cravesOverlay;

    // Phone Back: the sheet stays and asks, and its history entry is back for the next Back.
    await act(async () => {
      window.history.back();
    });
    await screen.findByRole("alertdialog", { name: "Discard your changes?" });
    expect(state()).toBe("open");
    await waitFor(() => expect((window.history.state as Record<string, unknown> | null)?.cravesOverlay).toBe(entry));
    expect(routerPopState).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Keep editing" }));

    // Keep editing brings the form's own actions back.
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Keep plan" })).toBeTruthy();

    // The close button asks too; Escape while asking keeps editing; Discard closes.
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Pause meal plan?" }), { key: "Escape" });
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(state()).toBe("open");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(state()).toBe("closed");
    await nextTick();
    window.removeEventListener("popstate", routerPopState);
  });

  // Last: it leaves a pop that never lands (history.back is stubbed).
  it("never adopts the entry of an overlay whose pop is still on its way", async () => {
    function Probe({ open }: { open: boolean }) {
      useOverlayHistory(open, () => undefined);
      return null;
    }
    const back = vi.spyOn(window.history, "back").mockImplementation(() => undefined);
    const view = render(createElement(Probe, { open: false }));
    await act(async () => {
      view.rerender(createElement(Probe, { open: true }));
    });
    const afterOpen = window.history.length;
    await act(async () => {
      view.rerender(createElement(Probe, { open: false }));
    });
    // Separate act: the close's 0 ms timer runs and calls history.back(), whose popstate is pending.
    await act(() => new Promise((resolve) => setTimeout(resolve, 5)));
    expect(back).toHaveBeenCalledTimes(1);
    await act(async () => {
      view.rerender(createElement(Probe, { open: true }));
    });
    expect(window.history.length).toBe(afterOpen + 1);
    back.mockRestore();
  });
});
