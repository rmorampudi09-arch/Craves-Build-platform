// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement, useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CodeSlots, type CodeSlotsStatus } from "@/shared/ui/forms/code-slots";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function Harness({ onComplete, status = "idle" }: { onComplete: (code: string) => void; status?: CodeSlotsStatus }) {
  const [code, setCode] = useState("");
  return createElement("label", null, "Six-digit OTP", createElement(CodeSlots, { value: code, onChange: setCode, onComplete, status }));
}

/** Rejects every code the way the sign-in forms do: red slots, then cleared for another try. */
function WrongCode({ onComplete }: { onComplete: (code: string) => void }) {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<CodeSlotsStatus>("idle");
  return createElement("label", null, "Six-digit OTP", createElement(CodeSlots, {
    value: code,
    status,
    onChange: (next: string) => { setCode(next); setStatus("idle"); },
    onComplete: (next: string) => { onComplete(next); setStatus("error"); window.setTimeout(() => setCode(""), 10); },
  }));
}

function typeDigits(input: HTMLElement, code: string) {
  for (let end = 1; end <= code.length; end += 1) fireEvent.change(input, { target: { value: code.slice(0, end) } });
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

  it("lets a pasted full code replace digits already typed instead of joining them", () => {
    const onComplete = vi.fn();
    render(createElement(Harness, { onComplete }));
    const input = screen.getByLabelText("Six-digit OTP") as HTMLInputElement;
    typeDigits(input, "123");
    fireEvent.change(input, { target: { value: "123Your OTP is 654321. Valid for 10 minutes" } });
    expect(input.value).toBe("654321");
    expect(onComplete).toHaveBeenCalledExactlyOnceWith("654321");
    // A new code pasted over a complete one is taken too.
    fireEvent.change(input, { target: { value: "654321 112233" } });
    expect(onComplete).toHaveBeenLastCalledWith("112233");
  });

  it("shows a wrong code on the slots themselves", () => {
    render(createElement(Harness, { onComplete: vi.fn(), status: "error" }));
    expect(document.querySelector(".code-slots")?.classList.contains("is-error")).toBe(true);
    expect(screen.getByLabelText("Six-digit OTP").getAttribute("aria-invalid")).toBe("true");
  });

  it("asks password managers not to draw their menus over the slots", () => {
    render(createElement(Harness, { onComplete: vi.fn() }));
    const input = screen.getByLabelText("Six-digit OTP");
    for (const name of ["data-lpignore", "data-1p-ignore", "data-bwignore"]) expect(input.getAttribute(name)).toBe("true");
    expect(input.getAttribute("data-form-type")).toBe("other");
  });

  it("with a mouse, lets go of focus on the sixth digit and takes it back once a wrong code is cleared", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query === "(pointer: fine)" }));
    const onComplete = vi.fn();
    render(createElement(WrongCode, { onComplete }));
    const input = screen.getByLabelText("Six-digit OTP") as HTMLInputElement;
    input.focus();
    // Typed one digit at a time, exactly like a paste: checked once, on the last digit.
    typeDigits(input, "12345");
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: "123456" } });
    expect(onComplete).toHaveBeenCalledExactlyOnceWith("123456");
    expect(document.activeElement).not.toBe(input);
    await waitFor(() => expect(document.activeElement).toBe(input));
    expect(input.value).toBe("");
  });

  it("on touch, keeps focus (and the keypad) through a wrong code", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    const onComplete = vi.fn();
    render(createElement(WrongCode, { onComplete }));
    const input = screen.getByLabelText("Six-digit OTP") as HTMLInputElement;
    input.focus();
    typeDigits(input, "123456");
    expect(onComplete).toHaveBeenCalledExactlyOnceWith("123456");
    expect(document.activeElement).toBe(input);
    await waitFor(() => expect(input.value).toBe(""));
    fireEvent.change(input, { target: { value: "Your OTP is 654321" } });
    expect(onComplete).toHaveBeenLastCalledWith("654321");
    // The harness clears a wrong code 10 ms later; let that happen before teardown.
    await waitFor(() => expect(input.value).toBe(""));
  });
});
