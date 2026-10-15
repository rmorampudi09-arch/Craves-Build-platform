// @vitest-environment jsdom
import { createElement, type ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => createElement("a", { href: to, ...props }, children),
}));

import { HelpSupport } from "@/features/support/screens/HelpSupport";

afterEach(cleanup);

describe("Help & support", () => {
  it("offers chat, a call to the support line and an email", () => {
    render(createElement(HelpSupport));
    expect(screen.getByRole("link", { name: /^Chat/ }).getAttribute("href")).toBe("/support");
    expect(screen.getByRole("link", { name: "Call: call Craves support on +91 83673 66787" }).getAttribute("href")).toBe("tel:+918367366787");
    expect(screen.getByRole("link", { name: /^Email/ }).getAttribute("href")).toBe("mailto:support@craves.in?subject=Craves%20support");
  });

  it("sends each common question to the page that answers it", () => {
    render(createElement(HelpSupport));
    const href = (name: string) => screen.getByRole("link", { name }).getAttribute("href");
    expect(href("Where is my order?")).toBe("/orders");
    expect(href("Refunds and cancellations")).toBe("/support");
    expect(href("Meal plans: pause, skip and cancel")).toBe("/subscriptions/how-it-works");
    expect(href("Payments and failed payments")).toBe("/support");
    expect(href("Changing my delivery address")).toBe("/addresses");
  });
});
