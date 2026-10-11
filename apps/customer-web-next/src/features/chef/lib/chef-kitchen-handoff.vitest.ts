import { describe, expect, it } from "vitest";
import { EMPTY_ONBOARDING } from "@/features/chef-onboarding/lib/chef-onboarding-v2-contract";
import { parseChefKitchenInput } from "@/features/chef/lib/chef-kitchen-contract";
import { kitchenFromApplication } from "@/features/chef/lib/chef-kitchen-handoff";

const details = {
  ...EMPTY_ONBOARDING,
  firstName: "Asha",
  lastName: "Rao",
  kitchenName: "Asha’s Kitchen",
  addressLine1: "Flat 4B, Lotus Residency",
  addressLine2: "Road No 5, Madhapur",
  city: "Hyderabad",
  state: "Telangana",
  postalCode: "500081",
  latitude: 17.4483,
  longitude: 78.3915,
};

describe("kitchen from the approved application", () => {
  it("builds a closed kitchen that the kitchen API accepts", () => {
    const input = kitchenFromApplication(details, "+919876543210");
    expect(input).toMatchObject({
      kitchenName: "Asha’s Kitchen",
      displayName: "Asha Rao",
      areaName: "Madhapur",
      phoneNumber: "+919876543210",
      status: "DRAFT",
    });
    expect(parseChefKitchenInput(input)).not.toBeNull();
  });

  it("leaves it to the kitchen form when the application lacks part of the address", () => {
    expect(kitchenFromApplication({ ...details, city: " " }, "+919876543210")).toBeNull();
  });
});
