import assert from "node:assert/strict";
import test from "node:test";
import { INVITATION_TEXT, smsShareUrl, whatsappShareUrl } from "./invitation.ts";

test("the invitation is the app's message followed by the Craves link", () => {
  assert.equal(
    INVITATION_TEXT,
    "Craves — homemade food from trusted home chefs.\nhttps://craves.in",
  );
});

test("WhatsApp and Messages links carry the whole invitation, encoded", () => {
  const encoded =
    "Craves%20%E2%80%94%20homemade%20food%20from%20trusted%20home%20chefs.%0Ahttps%3A%2F%2Fcraves.in";
  assert.equal(whatsappShareUrl(INVITATION_TEXT), `https://wa.me/?text=${encoded}`);
  assert.equal(smsShareUrl(INVITATION_TEXT), `sms:?&body=${encoded}`);
  assert.equal(new URL(whatsappShareUrl("a&b=c")).searchParams.get("text"), "a&b=c");
});
