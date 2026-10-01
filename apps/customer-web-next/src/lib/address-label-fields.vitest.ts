// @vitest-environment jsdom
import { createElement, useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AddressLabelFields } from "@/components/address-label-fields";
import { addressLabelFromDraft, createAddressLabelDraft } from "./address-contract";

function Editor({ initial = "HOME" }: { initial?: string }) {
  const [value, setValue] = useState(() => createAddressLabelDraft(initial));
  return createElement("div", null,
    createElement(AddressLabelFields, { value, onChange: setValue }),
    createElement("output", { "aria-label": "Saved label" }, addressLabelFromDraft(value) ?? "INVALID"),
  );
}

afterEach(cleanup);

describe("address label editor", () => {
  it("requires an Other name, saves its trimmed value and preserves it across category changes", () => {
    render(createElement(Editor));
    fireEvent.click(screen.getByRole("button", { name: "Other" }));
    expect(screen.getByLabelText("Saved label").textContent).toBe("INVALID");
    const input = screen.getByRole("textbox", { name: "Address name" });
    expect(input.getAttribute("maxlength")).toBe("80");
    fireEvent.change(input, { target: { value: "  Mom's House  " } });
    expect(screen.getByLabelText("Saved label").textContent).toBe("Mom's House");
    fireEvent.click(screen.getByRole("button", { name: "Work" }));
    expect(screen.queryByRole("textbox", { name: "Address name" })).toBeNull();
    expect(screen.getByLabelText("Saved label").textContent).toBe("WORK");
    fireEvent.click(screen.getByRole("button", { name: "Other" }));
    expect((screen.getByRole("textbox", { name: "Address name" }) as HTMLInputElement).value).toBe("  Mom's House  ");
  });

  it("opens existing custom addresses as Other and protects reserved values", () => {
    render(createElement(Editor, { initial: "Grandma's House" }));
    expect(screen.getByRole("button", { name: "Other" }).getAttribute("aria-pressed")).toBe("true");
    const input = screen.getByRole("textbox", { name: "Address name" });
    expect((input as HTMLInputElement).value).toBe("Grandma's House");
    fireEvent.change(input, { target: { value: "HOME" } });
    expect(screen.getByLabelText("Saved label").textContent).toBe("INVALID");
    expect(screen.getByText("Choose Home or Work above to use that label.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Other" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("shows historical OTHER as an editable Other name", () => {
    render(createElement(Editor, { initial: "OTHER" }));
    expect((screen.getByRole("textbox", { name: "Address name" }) as HTMLInputElement).value).toBe("Other");
  });
});
