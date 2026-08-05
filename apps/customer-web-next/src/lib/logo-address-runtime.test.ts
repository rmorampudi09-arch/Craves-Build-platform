import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("public layout uses the single approved Craves logo asset", () => {
  const logo = source("../components/layout/Logo.tsx");

  assert.match(logo, /CravesLogo/);
  assert.match(logo, /size="lg"/);
  assert.doesNotMatch(logo, /assets\/images\/craves-logo\.png/);
  assert.doesNotMatch(logo, /FOOD FROM HOME/);
});

test("customer address BFF targets the documented APIM collection route", () => {
  const route = source("../app/api/customer/addresses/route.ts");

  assert.match(route, /authenticatedApiFetch\(request, "\/customer\/addresses"/);
  assert.match(route, /parseCustomerAddresses/);
  assert.match(route, /parseCustomerAddress/);
});

test("address APIM pipeline is guarded and proves GET and POST routing", () => {
  const pipeline = source(
    "../../../../azure-pipelines-customer-addresses-apim.yml",
  );

  assert.match(pipeline, /confirmConfigureCustomerAddresses/);
  assert.match(pipeline, /configure-customer-addresses-apim\.sh/);
  assert.match(pipeline, /\/api\/v1\/customer\/addresses/);
  assert.match(pipeline, /GET=\$LIST_CODE POST=\$CREATE_CODE/);
  assert.match(pipeline, /expected HTTP 401 without a token/i);
});

test("address APIM configuration safely reuses pre-existing route operations", () => {
  const script = source(
    "../../../../scripts/apim/configure-customer-addresses-apim.sh",
  );

  assert.match(script, /resolve_operation_id/);
  assert.match(script, /route_shape/);
  assert.match(script, /Reusing existing APIM operation/);
  assert.match(script, /already owns another route/);
  assert.match(script, /configured idempotently/);
  assert.doesNotMatch(script, /az apim api operation delete/);
});
