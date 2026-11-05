// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import AccountDeletionPage, { metadata } from "./page";
import PrivacyPage from "../privacy/page";

afterEach(cleanup);

describe("public account deletion explainer", () => {
  it("explains how to ask, with the sign-in page and support email linked", () => {
    render(createElement(AccountDeletionPage));
    expect(metadata.title).toBe("Delete your Craves account | Craves");
    expect(screen.getByRole("heading", { level: 1, name: "Delete your Craves account" })).toBeTruthy();
    for (const heading of ["How to ask", "What happens and when", "What is deleted", "What Craves keeps, and for how long", "Questions"])
      expect(screen.getByRole("heading", { level: 2, name: heading }), heading).toBeTruthy();
    expect(screen.getByRole("link", { name: "craves.in/account/delete" }).getAttribute("href")).toBe("/account/delete");
    expect(screen.getAllByRole("link", { name: "support@craves.in" }).map((link) => link.getAttribute("href")).filter((href) => href === "mailto:support@craves.in")).toHaveLength(3);
    expect(screen.getByText("Customer accounts are deleted 30 days after you ask.")).toBeTruthy();
  });

  it("is linked from the privacy page, which names both payment providers", () => {
    const { container } = render(createElement(PrivacyPage));
    expect(screen.getByRole("link", { name: "Read more about account deletion" }).getAttribute("href")).toBe("/account-deletion");
    expect(container.textContent).toContain("Razorpay (website checkout and meal-plan payment) and Cashfree (the Craves app)");
    expect(container.textContent).toContain("Effective 5 November 2026.");
  });
});
