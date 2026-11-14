/**
 * The advanced-features calls (https://api.craves.in/api/v1/advanced/…) the website may make through
 * /api/advanced. Deny by default: a call that is not listed here is refused before it leaves the site.
 */
export type AdvancedOperation = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Path segments after /advanced; ":id" stands for one UUID, ":token" for one share token. */
  pattern: readonly string[];
  /** public: sent without the person's token. user: needs a signed-in person. */
  auth: "public" | "user";
  body: "required" | "optional" | "none";
};

export const ADVANCED_OPERATIONS: readonly AdvancedOperation[] = [
  // M01 food lists. The reorder call (items-order) is not used by the website.
  { method: "GET", pattern: ["food-lists"], auth: "user", body: "none" },
  { method: "POST", pattern: ["food-lists"], auth: "user", body: "required" },
  { method: "GET", pattern: ["food-lists", ":id"], auth: "user", body: "none" },
  { method: "PATCH", pattern: ["food-lists", ":id"], auth: "user", body: "required" },
  { method: "DELETE", pattern: ["food-lists", ":id"], auth: "user", body: "none" },
  { method: "PUT", pattern: ["food-lists", ":id", "items", ":id"], auth: "user", body: "optional" },
  { method: "DELETE", pattern: ["food-lists", ":id", "items", ":id"], auth: "user", body: "none" },
  { method: "POST", pattern: ["food-lists", ":id", "share"], auth: "user", body: "optional" },
  { method: "DELETE", pattern: ["food-lists", ":id", "share"], auth: "user", body: "none" },
  { method: "GET", pattern: ["shared-food-lists", ":token"], auth: "public", body: "none" },
  { method: "POST", pattern: ["shared-food-lists", ":token", "copy"], auth: "user", body: "none" },
];

const PLACEHOLDERS: Record<string, RegExp> = {
  ":id": /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  ":token": /^[A-Za-z0-9_-]{43}$/,
};

/** The listed operation for this call, or null. Ids must be UUIDs and tokens share tokens before anything is sent. */
export function findAdvancedOperation(method: string, segments: readonly string[]): AdvancedOperation | null {
  return (
    ADVANCED_OPERATIONS.find(
      (operation) =>
        operation.method === method &&
        operation.pattern.length === segments.length &&
        operation.pattern.every((part, index) => (PLACEHOLDERS[part] ? PLACEHOLDERS[part].test(segments[index]) : part === segments[index])),
    ) ?? null
  );
}
