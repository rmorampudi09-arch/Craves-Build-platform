// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ChefError, chefApiError, chefErrorText, chefUpstream } from "./chef-errors";
import { POST as reportChefError } from "@/app/api/chef/errors/route";

afterEach(() => vi.restoreAllMocks());

describe("chef error text", () => {
  it("prefers our exact text for the upstream reason, then the BFF message, then the status", () => {
    expect(chefApiError({ status: 409 }, { code: "CHEF_ACCEPTANCE_CONFLICT", reason: "CHEF_ACCEPTANCE_EXPIRED", message: "generic" }, "fb"))
      .toMatchObject({ ref: "CHEF_ACCEPTANCE_EXPIRED", message: expect.stringContaining("time to accept") });
    expect(chefApiError({ status: 400 }, { code: "KITCHEN_REQUEST_FAILED", message: "Complete the kitchen fields." }, "fb"))
      .toMatchObject({ ref: "KITCHEN_REQUEST_FAILED", message: "Complete the kitchen fields." });
    expect(chefApiError({ status: 503 }, { code: "CHEF_EARNINGS_UNAVAILABLE", message: "Chef earnings are temporarily unavailable." }, "fb").message)
      .toBe("Chef earnings are temporarily unavailable."); // a specific BFF sentence beats the family text
    expect(chefApiError({ status: 504 }, { code: "KITCHEN_TIMEOUT" }, "fb").message).toContain("took too long");
    expect(chefApiError({ status: 502 }, { code: "INVALID_CHEF_ORDERS_RESPONSE", message: "The deployed Order Service returned…" }, "fb").message)
      .toContain("couldn't read"); // developer text never reaches the chef
    expect(chefApiError({ status: 418 }, null, "Dish not saved.")).toMatchObject({ ref: "HTTP_418", message: "Dish not saved." });
    expect(chefApiError({ status: 409 }, { code: "MEAL_PLAN_NOT_READY", details: { message: "Add at least one meal." } }, "fb").message)
      .toBe("Add at least one meal.");
  });

  it("names the fields a validation failure is about", () => {
    expect(chefUpstream({ code: "VALIDATION_FAILED", details: ["price: must be positive", "items[0].preparationTimeMinutes: required"] }))
      .toEqual({ reason: "VALIDATION_FAILED", message: "Check these details and try again: Price, Preparation time minutes." });
    expect(chefUpstream({ code: "lower-case" })).toEqual({});
    expect(chefUpstream({ code: "SOMETHING_NEW" })).toEqual({ reason: "SOMETHING_NEW" }); // no message: the route keeps its own
  });

  it("turns browser failures into plain sentences and keeps screen hints without a reference", () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));
    expect(chefErrorText(new TypeError("Failed to fetch"), "fb")).toContain("(Ref: NETWORK_ERROR)");
    expect(chefErrorText(new DOMException("t", "TimeoutError"), "fb")).toContain("(Ref: TIMEOUT)");
    expect(chefErrorText(new SyntaxError("Unexpected token <"), "fb")).toContain("(Ref: UNEXPECTED_RESPONSE)");
    expect(chefErrorText(Object.assign(new Error("[{\"path\":[]}]"), { name: "ZodError" }), "fb")).toContain("UNEXPECTED_RESPONSE");
    expect(chefErrorText(new TypeError("x is undefined"), "fb")).toContain("(Ref: SCREEN_ERROR)");
    expect(chefErrorText(new Error("Accept the terms before submitting."), "fb")).toBe("Accept the terms before submitting.");
    expect(chefErrorText(new ChefError("Photo too big.", "MEDIA_FILE_TOO_LARGE", 400), "fb")).toBe("Photo too big. (Ref: MEDIA_FILE_TOO_LARGE)");
  });

  it("records what a chef saw once per screen and code, only on chef pages", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));
    window.history.replaceState(null, "", "/chef/menu");
    chefErrorText(new ChefError("a", "MENU_ONCE_TEST", 409), "fb");
    chefErrorText(new ChefError("a", "MENU_ONCE_TEST", 409), "fb");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchSpy.mock.calls[0][1]?.body))).toEqual({ screen: "/chef/menu", code: "MENU_ONCE_TEST", status: 409 });
    window.history.replaceState(null, "", "/cart");
    chefErrorText(new ChefError("a", "CUSTOMER_PAGE_TEST", 409), "fb");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/chef/errors", () => {
  const post = (body: unknown, origin = "https://craves.in") => reportChefError(new NextRequest("https://craves.in/api/chef/errors", {
    method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body),
  }));

  it("logs one line without record ids", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const response = await post({ screen: "/chef/orders/3f1c2b7e-9a1d-4c3b-8e2f-1a2b3c4d5e6f", code: "CHEF_ACCEPTANCE_EXPIRED", status: 409 });
    expect(response.status).toBe(204);
    expect(JSON.parse(String(warn.mock.calls[0][0]))).toEqual({ event: "CHEF_ERROR_SHOWN", screen: "/chef/orders/:id", code: "CHEF_ACCEPTANCE_EXPIRED", status: 409 });
  });

  it("rejects other pages, free text and other origins", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect((await post({ screen: "/admin", code: "X_Y", status: 400 })).status).toBe(400);
    expect((await post({ screen: "/chef", code: "secret value", status: 400 })).status).toBe(400);
    expect((await post({ screen: "/chef", code: "X_Y", status: 400 }, "https://evil.example")).status).toBe(403);
    expect(warn).not.toHaveBeenCalled();
  });
});
