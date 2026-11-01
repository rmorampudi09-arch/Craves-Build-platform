// @vitest-environment node
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import { expect, it } from "vitest";
import nextConfig from "../../next.config";

it("API answers are never stored, except photos, whose routes cache them themselves", async () => {
  const rules = await nextConfig.headers!();
  // Matched the way the Next server matches header rules; the last rule to set a key wins.
  const cacheControl = (path: string) =>
    rules
      .filter((rule) => getPathMatch(rule.source, { strict: true, removeUnnamedParams: true })(path))
      .flatMap((rule) => rule.headers)
      .filter((header) => header.key === "Cache-Control")
      .at(-1)?.value;
  for (const path of [
    "/api/orders",
    "/api/subscriptions/plans",
    "/api/chef/subscription-plans/x",
    "/api/subscriptions/plans/x/image/more",
  ])
    expect(cacheControl(path), path).toBe("private, no-store, max-age=0");
  for (const path of [
    "/api/catalog/banners/x/image",
    "/api/chef/subscription-plans/x/image",
    "/api/subscriptions/plans/x/image",
  ])
    expect(cacheControl(path), path).toBeUndefined();
});
