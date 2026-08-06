import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("customer and chef OTP flows expose resend with single-border focus", () => {
  const modal = source("../components/auth/AuthModal.tsx");
  const standalone = source("../components/phone-auth-form.tsx");
  const slots = source("../components/ui/forms/input-otp.tsx");

  for (const contents of [modal, standalone]) {
    assert.match(contents, /RESEND_DELAY_SECONDS = 30/);
    assert.match(contents, /Resend OTP/);
    assert.match(contents, /focus-visible:outline-none/);
    assert.match(contents, /focus-visible:ring-0/);
  }

  assert.match(slots, /isActive && "z-10 border-\[#F62E18\]"/);
  assert.doesNotMatch(slots, /ring-1 ring-ring/);
});

test("signed-in discovery uses a pure white page surface behind product cards", () => {
  const browse = source("../screens/public/BrowseFoods/BrowseFoods.tsx");

  assert.match(browse, /min-h-screen bg-white pb-24 text-ink/);
  assert.match(
    browse,
    /flex min-h-screen items-center justify-center bg-white/,
  );
  assert.doesNotMatch(browse, /min-h-screen bg-cream pb-24/);
});
