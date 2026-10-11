// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement, useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CodeSlots, type CodeSlotsStatus } from "@/shared/ui/forms/code-slots";

afterEach(cleanup);

function Harness({ onComplete, status = "idle" }: { onComplete: (code: string) => void; status?: CodeSlotsStatus }) {
  const [code, setCode] = useState("");
  return createElement("label", null, "Six-digit OTP", createElement(CodeSlots, { value: code, onChange: setCode, onComplete, status }));
}

describe("CodeSlots", () => {
  it("is one autofill-ready input under six slots that screen readers skip", () => {
    render(createElement(Harness, { onComplete: vi.fn() }));
    const input = screen.getByLabelText("Six-digit OTP") as HTMLInputElement;
    expect(input.getAttribute("autocomplete")).toBe("one-time-code");
    expect(input.getAttribute("inputmode")).toBe("numeric");
    expect(document.querySelectorAll(".code-slot")).toHaveLength(6);
    expect(document.querySelector(".code-slots-row")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("keeps digits only, and reports a pasted or autofilled code once when it is complete", () => {
    const onComplete = vi.fn();
    render(createElement(Harness, { onComplete }));
    const input = screen.getByLabelText("Six-digit OTP") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "12a" } });
    expect(input.value).toBe("12");
    expect(document.querySelectorAll(".code-slot[data-filled]")).toHaveLength(2);
    // Browsers cut a paste to maxlength before onChange (jsdom doesn't), so there must be none.
    expect(input.hasAttribute("maxlength")).toBe(false);
    fireEvent.change(input, { target: { value: "123 456" } });
    expect(input.value).toBe("123456");
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith("123456");
    fireEvent.change(input, { target: { value: "1234567" } });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("shows a wrong code on the slots themselves", () => {
    render(createElement(Harness, { onComplete: vi.fn(), status: "error" }));
    expect(document.querySelector(".code-slots")?.classList.contains("is-error")).toBe(true);
    expect(screen.getByLabelText("Six-digit OTP").getAttribute("aria-invalid")).toBe("true");
  });
});
