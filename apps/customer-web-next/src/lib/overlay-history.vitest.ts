// @vitest-environment jsdom
import { createElement, useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MotionGlobalConfig } from "framer-motion";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Dialog, Sheet } from "@/components/ui/overlays/overlay";

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterEach(cleanup);

const nextTick = () => act(() => new Promise((resolve) => setTimeout(resolve, 20)));

function Harness({ kind = "dialog", outside = true }: { kind?: "dialog" | "sheet"; outside?: boolean }) {
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
});
