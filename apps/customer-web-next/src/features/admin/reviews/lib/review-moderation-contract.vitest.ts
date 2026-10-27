import { describe, expect, it } from "vitest";
import { moderationRequestSchema, reviewTarget } from "@/features/admin/reviews/lib/review-moderation-contract";

const id = "6212c931-b8ac-4cc7-8cf6-3a9672046b11";
const search = (query = "") => new URLSearchParams(query);

describe("review moderation contract", () => {
  it("builds the queue call with a fixed page size and only known filters", () => {
    expect(reviewTarget("GET", [], search())).toBe("/admin/reviews?limit=25");
    expect(reviewTarget("GET", [], search("status=PENDING_MODERATION&cursor=abc_123="))).toBe("/admin/reviews?limit=25&status=PENDING_MODERATION&cursor=abc_123%3D");
    expect(reviewTarget("GET", [], search("status=ANYTHING"))).toBeNull();
    expect(reviewTarget("GET", [], search("cursor=%0Aevil"))).toBeNull();
  });
  it("allows only the moderation call on a review id", () => {
    expect(reviewTarget("PUT", [id, "moderation"], search())).toBe(`/admin/reviews/${id}/moderation`);
    expect(reviewTarget("PUT", ["..", "moderation"], search())).toBeNull();
    expect(reviewTarget("PUT", [id], search())).toBeNull();
    expect(reviewTarget("DELETE", [id, "moderation"], search())).toBeNull();
    expect(reviewTarget("GET", [id, "reports"], search())).toBeNull();
  });
  it("needs a known action and a 10 to 500 character ASCII reason, nothing else", () => {
    expect(moderationRequestSchema.safeParse({ action: "PUBLISH", reason: "Checked the order." }).success).toBe(true);
    expect(moderationRequestSchema.safeParse({ action: "PUBLISH", reason: "too short" }).success).toBe(false);
    expect(moderationRequestSchema.safeParse({ action: "DELETE", reason: "Checked the order." }).success).toBe(false);
    expect(moderationRequestSchema.safeParse({ action: "HIDE", reason: "ఆర్డర్ తనిఖీ చేశాను సరే" }).success).toBe(false);
    expect(moderationRequestSchema.safeParse({ action: "HIDE", reason: "Line one\r\nX-Other: 1" }).success).toBe(false);
    expect(moderationRequestSchema.safeParse({ action: "HIDE", reason: "Checked the order.", status: "PUBLISHED" }).success).toBe(false);
  });
});
