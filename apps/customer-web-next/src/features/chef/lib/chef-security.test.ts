import assert from "node:assert/strict";
import test from "node:test";
import { maskEmail, maskPhone } from "./chef-security.ts";

test("login details are masked like the app", () => {
  assert.equal(maskPhone("+919876543210"), "+91 ••••• 43210");
  assert.equal(maskPhone("9876543210"), "+91 ••••• 43210");
  assert.equal(maskEmail("chef.asha@gmail.com"), "c••••••@gmail.com");
  assert.equal(maskEmail("a@craves.in"), "a•@craves.in");
});
