import { describe, expect, it } from "vitest";
import { deletionCopy } from "@/features/account-deletion/domain/deletion-copy";
import { entryStateFor, formatDeletionDate, isDeletionPaused, scopePlanFor, summaryKindFor } from "@/features/account-deletion/domain/deletion-model";
import type { DeletionScope, DeletionView } from "@/features/account-deletion/domain/deletion-types";

const view = (over: Partial<DeletionView>): DeletionView => ({ requestId: "r1", scope: "ALL", status: "SCHEDULED", requestedAt: "2026-11-05T05:00:00Z", dueAt: "2026-12-05T05:00:00Z", reviewNote: null, ...over });
const options = (plan: ReturnType<typeof scopePlanFor>) => (plan.kind === "choose" ? plan.options.map((o) => o.scope) : null);

describe("deletion model", () => {
  it("entryStateFor maps the latest request", () => {
    expect(entryStateFor(null)).toEqual({ kind: "start" });
    expect(entryStateFor(view({ status: "CANCELLED" })).kind).toBe("start");
    expect(entryStateFor(view({ status: "COMPLETED" })).kind).toBe("start");
    expect(entryStateFor(view({ status: "PENDING_REVIEW", dueAt: null })).kind).toBe("inReview");
    expect(entryStateFor(view({ status: "SCHEDULED" })).kind).toBe("scheduled");
    expect(entryStateFor(view({ status: "WAITING_ON_OPEN_ITEMS" })).kind).toBe("waiting");
    expect(entryStateFor(view({ status: "ERASING" })).kind).toBe("erasing");
    expect(entryStateFor(view({ status: "REJECTED", reviewNote: "Payout dispute open" })).kind).toBe("declined");
  });

  it("scopePlanFor sends a customer-only account straight to ALL and a rider-holder to CUSTOMER", () => {
    expect(scopePlanFor(["CUSTOMER"], null)).toEqual({ kind: "direct", scope: "ALL" });
    expect(scopePlanFor(["CUSTOMER"], "customer")).toEqual({ kind: "direct", scope: "ALL" });
    expect(scopePlanFor(["CUSTOMER", "RIDER"], null)).toEqual({ kind: "direct", scope: "CUSTOMER" });
  });

  it("scopePlanFor offers the side the person came from, then the whole account", () => {
    expect(options(scopePlanFor(["CUSTOMER", "CHEF"], "chef"))).toEqual(["CHEF", "ALL"]);
    expect(options(scopePlanFor(["CUSTOMER", "CHEF"], "customer"))).toEqual(["CUSTOMER", "ALL"]);
    expect(scopePlanFor(["CUSTOMER", "CHEF"], "chef")).toEqual({ kind: "choose", riderNote: false, options: [
      { scope: "CHEF", ...deletionCopy.chooser.chefSide }, { scope: "ALL", ...deletionCopy.chooser.whole }] });
    expect(scopePlanFor(["CHEF"], "chef").kind).toBe("choose"); // chef whose customer side is gone
  });

  it("scopePlanFor offers three choices, in the copy's order, when the side is unknown", () => {
    expect(options(scopePlanFor(["CUSTOMER", "CHEF"], null))).toEqual(["CUSTOMER", "CHEF", "ALL"]);
    expect(scopePlanFor(["CUSTOMER", "CHEF"], null)).toMatchObject({ options: [
      { scope: "CUSTOMER", ...deletionCopy.chooser.customerSide }, { scope: "CHEF", ...deletionCopy.chooser.chefSide }, { scope: "ALL", ...deletionCopy.chooser.whole }] });
  });

  it("scopePlanFor never offers the whole account to a rider", () => {
    expect(scopePlanFor(["CUSTOMER", "CHEF", "RIDER"], null)).toMatchObject({ kind: "choose", riderNote: true });
    expect(options(scopePlanFor(["CUSTOMER", "CHEF", "RIDER"], null))).toEqual(["CUSTOMER", "CHEF"]);
    expect(options(scopePlanFor(["CUSTOMER", "CHEF", "RIDER"], "chef"))).toEqual(["CHEF"]);
    expect(options(scopePlanFor(["CUSTOMER", "CHEF", "RIDER"], "customer"))).toEqual(["CUSTOMER"]);
  });

  it("summaryKindFor", () => {
    expect(summaryKindFor("ALL", ["CUSTOMER"])).toBe("customerAll");
    expect(summaryKindFor("ALL", ["CUSTOMER", "CHEF"])).toBe("chefAll");
    expect(summaryKindFor("CUSTOMER", ["CUSTOMER", "CHEF"])).toBe("customerSide");
    expect(summaryKindFor("CHEF", ["CUSTOMER", "CHEF"])).toBe("chefSide");
    expect(summaryKindFor("SOMETHING_NEW" as DeletionScope, ["CUSTOMER"])).toBe("customerAll"); // an unknown scope reads as the whole account
  });

  it("formatDeletionDate uses the given time zone and reads a bad date as empty", () => {
    expect(formatDeletionDate("2026-12-05T05:00:00Z", "short", "Asia/Kolkata")).toBe("5 Dec");
    expect(formatDeletionDate("2026-12-05T05:00:00Z", "long", "Asia/Kolkata")).toBe("5 Dec 2026");
    expect(formatDeletionDate("2026-12-05T18:30:00Z", "short", "Asia/Kolkata")).toBe("6 Dec");
    expect(formatDeletionDate("not a date", "short")).toBe("");
    expect(formatDeletionDate("", "long")).toBe("");
  });

  it("isDeletionPaused is true only for the pending-deletion code", () => {
    expect(isDeletionPaused("ACCOUNT_DELETION_PENDING")).toBe(true);
    expect(isDeletionPaused("CART_EMPTY")).toBe(false);
    expect(isDeletionPaused(null)).toBe(false);
    expect(isDeletionPaused(undefined)).toBe(false);
  });

  it("copy: the website changes and the no-date paused texts", () => {
    expect(deletionCopy.customerSummary.dateBody).toBe("30 days from today. Until then you can keep your account on this page or in the app.");
    expect(deletionCopy.web.unavailable).toBe("Deleting an account from the website isn't available yet. You can ask in the Craves app, or email support@craves.in.");
    expect(deletionCopy.web.signInFirst).toBe("Sign in with the phone number on your account to continue.");
    expect(deletionCopy.paused.link).toBe("Keep my account");
    expect(deletionCopy.paused.orders(null)).toBe("Your account is set to be deleted, so new orders are paused.");
    expect(deletionCopy.paused.mealPlans(null)).toBe("Your account is set to be deleted, so new meal plans are paused.");
  });
});
