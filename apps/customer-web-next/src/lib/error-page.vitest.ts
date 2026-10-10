// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import ErrorPage from "@/app/error";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("gives the customer a reference to quote and a way to reach support", async () => {
  const writeText = vi.fn(async () => undefined);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  const error = Object.assign(new Error("boom"), { digest: "4129870345" });
  render(createElement(ErrorPage, { error, reset: vi.fn() }));

  expect(screen.getByText("4129870345").className).toContain("select-all");
  fireEvent.click(screen.getByRole("button", { name: "Copy" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy());
  expect(writeText).toHaveBeenCalledWith("4129870345");
  expect(screen.getByRole("link", { name: "Contact support" }).getAttribute("href")).toBe("/contact");
});

it("shows no reference chip when there is no digest", () => {
  render(createElement(ErrorPage, { error: new Error("client"), reset: vi.fn() }));
  expect(screen.queryByText(/Reference:/)).toBeNull();
});
