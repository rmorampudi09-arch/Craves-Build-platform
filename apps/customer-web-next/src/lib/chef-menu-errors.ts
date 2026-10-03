/** Only expose known menu failures with the status used by Catalog. */
export function chefMenuFailure(status: number, raw: unknown): { code: string; message: string } | null {
  if (!raw || typeof raw !== "object" || !("code" in raw)) return null;
  if (status === 400 && raw.code === "KITCHEN_PROFILE_REQUIRED") {
    return { code: raw.code, message: "Set up your kitchen before adding or managing dishes." };
  }
  if (status === 409 && raw.code === "CHEF_SELLING_NOT_READY") {
    return { code: raw.code, message: "Finance review is required before publishing. Ask Craves admin to complete your tax and fee-terms review." };
  }
  if (status === 503 && raw.code === "CATALOG_ELIGIBILITY_UNAVAILABLE") {
    return { code: raw.code, message: "Publishing could not be checked right now. Please try again shortly." };
  }
  return null;
}
