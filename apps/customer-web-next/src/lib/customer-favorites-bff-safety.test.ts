import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("favorites BFF keeps authentication server-side and guards writes by origin", () => {
  const listRoute = source("../app/api/customer/favorites/route.ts");
  const mutationRoute = source("../app/api/customer/favorites/[menuItemId]/route.ts");

  assert.match(listRoute, /authenticatedApiFetch/);
  assert.match(mutationRoute, /authenticatedApiFetch/);
  assert.match(mutationRoute, /isSameOrigin/);
  assert.match(mutationRoute, /ORIGIN_REJECTED/);
  assert.match(mutationRoute, /isUuid/);
  assert.doesNotMatch(listRoute, /Authorization.*NextResponse/);
  assert.doesNotMatch(mutationRoute, /Authorization.*NextResponse/);
});
