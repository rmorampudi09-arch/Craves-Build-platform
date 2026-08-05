import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("public layout uses the single approved Craves logo component", () => {
  const logo = source("../components/layout/Logo.tsx");

  assert.match(logo, /CravesLogo/);
  assert.match(logo, /size="lg"/);
  assert.doesNotMatch(logo, /assets\/images\/craves-logo\.png/);
  assert.doesNotMatch(logo, /FOOD FROM HOME/);
});

test("brand component serves the approved PNG directly", () => {
  const logo = source("../components/brand/CravesLogo.tsx");

  assert.match(logo, /src="\/brand\/craves-logo\.png"/);
  assert.match(logo, /unoptimized/);
  assert.doesNotMatch(logo, /craves-logo\.svg/);
});

test("customer address BFF targets the documented APIM collection route", () => {
  const route = source("../app/api/customer/addresses/route.ts");

  assert.match(route, /authenticatedApiFetch\(request, "\/customer\/addresses"/);
  assert.match(route, /parseCustomerAddresses/);
  assert.match(route, /parseCustomerAddress/);
  assert.match(route, /INVALID_ADDRESS_RESPONSE/);
  assert.match(route, /upstreamStatus/);
});

test("address parser preserves legacy rows and gates checkout readiness", () => {
  const contract = source("./address-contract.ts");

  assert.match(contract, /recipientName: string \| null/);
  assert.match(contract, /areaName: string \| null/);
  assert.match(contract, /postalCode: string \| null/);
  assert.match(contract, /latitude: number \| null/);
  assert.match(contract, /isDeliveryReadyAddress/);
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

test("address APIM configuration reuses matching live operations safely", () => {
  const script = source(
    "../../../../scripts/apim/configure-customer-addresses-apim.sh",
  );

  assert.match(script, /az apim api operation list/);
  assert.match(script, /Reusing existing APIM operation/);
  assert.match(script, /CONFIGURED_OPERATION_IDS/);
  assert.match(script, /Multiple APIM operations already use/);
  assert.match(script, /refusing to overwrite it/);
  assert.doesNotMatch(script, /az apim api operation delete/);
});
