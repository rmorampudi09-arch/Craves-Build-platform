import assert from "node:assert/strict";
import test from "node:test";
import { CHEF_ERROR_MESSAGES, ChefError, chefApiError, chefErrorText, isChefAccessText } from "./chef-errors.ts";

/** The chef's saved language, as the language chooser's cookie; no document is the server. */
function speak(language: string | null) {
  if (language === null) Reflect.deleteProperty(globalThis, "document");
  else Object.defineProperty(globalThis, "document", { value: { cookie: `craves_lang=${language}` }, configurable: true });
}

// Every English sentence a chef screen can get from chef-errors.ts: by code, by status, and the general ones.
const SENTENCES = [
  ...Object.values(CHEF_ERROR_MESSAGES),
  ...[401, 403, 413, 429].map((status) => chefApiError({ status }, null, "").message),
  chefApiError({ status: 400 }, { reason: "VALIDATION_FAILED" }, "").message,
  chefApiError({ status: 503 }, { code: "SOMETHING_UNAVAILABLE" }, "").message,
  chefApiError({ status: 500 }, null, "").message,
];

test("every chef error sentence reads in Telugu and Kannada, keeping its English reference", () => {
  try {
    for (const language of ["te", "kn"]) {
      speak(language);
      for (const english of new Set(SENTENCES)) {
        const [words, ref] = chefErrorText(new ChefError(english, "SOME_CODE", 500), "").split(" (Ref: ");
        assert.ok(words.trim() && words !== english, `${language} is missing: ${english}`);
        assert.equal(ref, "SOME_CODE)");
      }
      const fields = chefErrorText(chefApiError({ status: 400 }, { reason: "VALIDATION_FAILED", details: ["price: must be positive"] }, ""), "");
      assert.match(fields, /: Price\. \(Ref: VALIDATION_FAILED\)$/);
      assert.doesNotMatch(fields, /^Check these details/);
      assert.equal(isChefAccessText(chefErrorText(chefApiError({ status: 403 }, { code: "CHEF_ACCESS_REQUIRED" }, ""), "")), true);
    }
  } finally {
    speak(null);
  }
});

test("English, the server and a screen's own sentence stay word for word", () => {
  for (const language of [null, "en"]) {
    speak(language);
    assert.equal(chefErrorText(new ChefError(CHEF_ERROR_MESSAGES.ORDER_NOT_FOUND, "ORDER_NOT_FOUND", 404), ""), `${CHEF_ERROR_MESSAGES.ORDER_NOT_FOUND} (Ref: ORDER_NOT_FOUND)`);
  }
  speak("te");
  assert.equal(chefErrorText(new Error("ముందు నిబంధనలు ఒప్పుకోండి."), "fb"), "ముందు నిబంధనలు ఒప్పుకోండి.");
  speak(null);
});
