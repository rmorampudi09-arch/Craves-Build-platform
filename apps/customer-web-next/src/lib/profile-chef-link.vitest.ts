import { describe, expect, it } from "vitest";
import { chefLink } from "@/features/profile/screens/Profile";
import type { ChefApplication } from "../features/chef-onboarding/lib/chef-application-contract";
import type { CravesUser } from "@/features/auth/api/cravesAuth";

const customer = { roles: ["CUSTOMER"] } as CravesUser;
const application = (patch: Partial<ChefApplication>) =>
  ({ id: null, status: "NOT_SUBMITTED", documents: [], ...patch }) as ChefApplication;

describe("profile chef card", () => {
  it("sends chefs and approved applicants through chef sign-in to Chef mode", () => {
    expect(chefLink({ roles: ["CUSTOMER", "chef"] } as CravesUser, null).to).toBe("/chef/sign-in?returnTo=/chef");
    expect(chefLink(customer, application({ status: "APPROVED" })).to).toBe("/chef/sign-in?returnTo=/chef");
  });

  it("tells a draft apart from a customer who never started", () => {
    expect(chefLink(customer, application({ id: "11111111-1111-4111-8111-111111111111" })).title)
      .toBe("Continue your chef application");
    expect(chefLink(customer, application({})).title).toBe("Become a home chef");
    expect(chefLink(customer, null)).toEqual({
      to: "/chef/sign-in?returnTo=/chef/application",
      title: "Become a home chef",
      subtitle: "Apply to cook and sell through Craves",
    });
    expect(chefLink(customer, application({ status: "PENDING" })).to).toBe("/chef/sign-in?returnTo=/chef/application");
  });
});
