import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("customer and chef OTP flows hide visible captcha and enforce one border", () => {
  const modal = source("../components/AuthModal.tsx");
  const standalone = source("../components/phone-auth-form.tsx");
  const slots = source("../../../shared/ui/forms/input-otp.tsx");
  const overrides = source("../styles/otp-overrides.css");
  const layout = source("../../../app/layout.tsx");

  for (const contents of [modal, standalone]) {
    assert.match(contents, /RESEND_DELAY_SECONDS = 30/);
    assert.match(contents, /type RecaptchaMode = "visible" \| "invisible"/);
    assert.match(contents, /craves-recaptcha-resend/);
    assert.match(contents, /size: visible \? "normal" : "invisible"/);
    // The code is typed into CodeSlots: one real input under six animated slots.
    assert.match(contents, /<CodeSlots/);
  }
  const codeSlots = source("../../../shared/ui/forms/code-slots.tsx");
  const codeSlotStyles = source("../../../shared/ui/forms/code-slots.css");
  assert.match(codeSlots, /autoComplete="one-time-code"/);
  assert.match(codeSlots, /inputMode="numeric"/);
  assert.match(codeSlots, /className="code-slots-row" aria-hidden="true"/);
  for (const motion of [/bounce = 0\.2/, /settle = 0\.3/, /rise = 8/, /cascade = 14/, /outcome = "accept"/])
    assert.match(codeSlots, motion);
  // A correct code turns green quickly while the next page loads (no fixed wait before it opens).
  assert.match(codeSlotStyles, /cs-accept 260ms/);
  assert.doesNotMatch(standalone, /setTimeout\(resolve/);
  assert.match(codeSlotStyles, /prefers-reduced-motion: reduce/);
  // Theme rules paint inputs with !important from Tailwind's components layer; only a reset in the
  // earlier base layer keeps the real input invisible over the slots (chef sign-in showed a white box).
  assert.match(codeSlotStyles, /@layer base \{\s*\.code-slots \.code-slots-input\.code-slots-input \{[^}]*background: transparent !important/);
  assert.match(codeSlotStyles, /@layer base \{[^}]*-webkit-text-fill-color: transparent !important/);
  // Autofill paints its own !important background, which only a days-long colour transition holds
  // off; an inset box-shadow would cover the slots too. Password manager menus are opted out.
  assert.match(codeSlotStyles, /\.code-slots-input:-webkit-autofill[^{]*\{[^}]*transition: background-color 600000s/);
  assert.match(codeSlotStyles, /\.code-slots-input:autofill \{[^}]*transition: background-color 600000s/);
  assert.doesNotMatch(codeSlotStyles, /box-shadow: [^;]*inset/);
  for (const optOut of [/data-lpignore="true"/, /data-1p-ignore="true"/, /data-bwignore="true"/, /data-form-type="other"/])
    assert.match(codeSlots, optOut);
  // A wrong code turns the borders red; it never fills the slots with a red tint.
  assert.doesNotMatch(codeSlotStyles, /is-error[^}]*background: var\(--cs-danger\)/);
  assert.match(source("../landing-modal/AuthModal.tsx"), /<CodeSlots/);

  assert.match(modal, /Resend verification code/);
  assert.doesNotMatch(modal, /Resend OTP/);
  assert.match(standalone, /Resend OTP/);

  assert.match(modal, /!otpSent && \(/);
  assert.match(standalone, /!otpStage && \(/);
  assert.match(modal, /clearVerifier\(\);\s*setOtp\(""\);\s*setOtpSent\(true\)/s);
  assert.match(standalone, /clearVerifier\(\);\s*setOtp\(""\);\s*setStage\("otp"\)/s);

  assert.match(layout, /import "\.\.\/features\/sign-in\/styles\/otp-overrides\.css"/);
  assert.match(overrides, /input\.craves-otp-field:focus-visible/);
  assert.match(overrides, /border: 1px solid #f62e18 !important/);
  assert.match(overrides, /outline: 0 !important/);
  assert.match(overrides, /box-shadow: none !important/);
  assert.match(overrides, /--tw-ring-shadow: 0 0 #0000 !important/);

  assert.match(slots, /className=\{cn\([\s\S]*craves-otp-slot/);
  assert.match(slots, /data-active=\{isActive \? "true" : "false"\}/);
  assert.doesNotMatch(slots, /shadow-sm|ring-1 ring-ring/);
});

test("signed-in discovery keeps the rebuilt paper reference surface", () => {
  const browse = source("../../home/screens/BrowseFoods.tsx");
  const skeleton = source("../../../shared/components/loading/CustomerPageSkeleton.tsx");

  assert.match(
    browse,
    /return <CustomerPageSkeleton label="Loading your Craves home" \/>/,
  );
  assert.match(browse, /failFastUnauthenticated: true/);
  assert.match(browse, /hydrateCustomerProfile: "background"/);
  assert.match(browse, /setUser\(current\);\s*setDefaultAddressResolved\(true\);/);
  assert.match(browse, /subscribeSession/);
  assert.match(browse, /const current = getSession\(\);\s*if \(current\) setUser\(current\);/);
  assert.match(browse, /const cartLoad = loadCart\(\)/);
  assert.match(browse, /recoverSessionSnapshotForNavigation\(\)/);
  assert.match(browse, /const hasInitialCatalog =/);
  assert.match(browse, /const shouldPreserveCatalog =/);
  assert.match(browse, /await refreshDiscovery\(defaultAddress, false, shouldPreserveCatalog\)/);
  assert.match(browse, /AuthenticationRequiredError/);
  assert.match(skeleton, /CustomerPageSkeleton\.module\.css/);
  assert.match(skeleton, /SkeletonBlock/);
  assert.doesNotMatch(skeleton, /animate-pulse/);
  assert.match(
    browse,
    /\$\{styles\.paperSurface\} min-h-screen pb-24 text-\[#1A1A1A\]/,
  );
  assert.doesNotMatch(browse, /text-\[#261A15\]/i);
});

test("static landing keeps the approved sign-in bridge wired", () => {
  const landing = source("../../../../public/landing-v20/index.html");

  assert.match(landing, /id="craves-landing-auth-bridge"/);
  assert.match(landing, /a\[href="#sign-in"\]/);
  assert.match(landing, /\/landing-auth\/manifest\.json/);
  assert.match(landing, /openLandingAuth/);
});
