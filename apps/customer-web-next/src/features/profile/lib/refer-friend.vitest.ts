// @vitest-environment jsdom
import { createElement, type ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) =>
    createElement("a", { href: to, ...props }, children),
}));

import { ReferFriend } from "@/features/profile/screens/ReferFriend";

const TEXT = "Craves — homemade food from trusted home chefs.\nhttps://craves.in";

function stubNavigator(value: Partial<Navigator>) {
  for (const [key, entry] of Object.entries(value)) {
    Object.defineProperty(window.navigator, key, { value: entry, configurable: true });
  }
}

afterEach(() => {
  cleanup();
  for (const key of ["share", "clipboard"]) Reflect.deleteProperty(window.navigator, key);
});

describe("Refer a friend", () => {
  it("shares to WhatsApp and Messages, and hides More without a system share sheet", () => {
    render(createElement(ReferFriend));
    expect(screen.getByRole("link", { name: "WhatsApp" }).getAttribute("href")).toBe(
      `https://wa.me/?text=${encodeURIComponent(TEXT)}`,
    );
    expect(screen.getByRole("link", { name: "Messages" }).getAttribute("href")).toBe(
      `sms:?&body=${encodeURIComponent(TEXT)}`,
    );
    expect(screen.queryByRole("button", { name: "More" })).toBeNull();
  });

  it("copies the Craves link and says so", async () => {
    const writeText = vi.fn(async () => undefined);
    stubNavigator({ clipboard: { writeText } as unknown as Clipboard });
    render(createElement(ReferFriend));
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    expect(await screen.findByText("Link copied")).toBeTruthy();
    expect(writeText).toHaveBeenCalledWith("https://craves.in");
  });

  it("opens the system share sheet with the whole invitation, and a closed sheet is not an error", async () => {
    const share = vi.fn(async () => {
      throw new DOMException("closed", "AbortError");
    });
    stubNavigator({ share });
    render(createElement(ReferFriend));
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    await vi.waitFor(() => expect(share).toHaveBeenCalledWith({ text: TEXT }));
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("explains when copying is unavailable", async () => {
    render(createElement(ReferFriend));
    fireEvent.click(screen.getByRole("button", { name: "Copy invitation message" }));
    expect(await screen.findByText("Copying is unavailable on this device.")).toBeTruthy();
  });
});
