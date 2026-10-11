import test from "node:test";
import assert from "node:assert/strict";
import { apiTarget } from "./api-target.ts";

test("Academy uses its actual APIM surface on both approved gateway hostnames", () => {
  for (const host of ["api.craves.in", "apim-craves-prodlow-l3ing6.azure-api.net"]) {
    assert.equal(apiTarget(`https://${host}/api/v1`, "/academy/catalog"), `https://${host}/academy/catalog`);
    assert.equal(apiTarget(`https://${host}/api/v1`, "/academy/plans/test?revision=2"), `https://${host}/academy/plans/test?revision=2`);
    assert.equal(apiTarget(`https://${host}/api/v1`, "/auth/me"), `https://${host}/api/v1/auth/me`);
    assert.equal(apiTarget(`https://${host}/api/v1`, "/orders"), `https://${host}/api/v1/orders`);
  }
});
