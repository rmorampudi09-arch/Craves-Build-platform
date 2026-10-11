import { CHEF_ERROR_MESSAGES } from "./chef-errors";

/** Only expose known menu failures with the status used by Catalog. */
export function chefMenuFailure(status: number, raw: unknown): { code: string; message: string } | null {
  if (!raw || typeof raw !== "object" || !("code" in raw)) return null;
  if (status === 400 && raw.code === "KITCHEN_PROFILE_REQUIRED") {
    return { code: raw.code, message: "Set up your kitchen before adding or managing dishes." };
  }
  if (status === 409 && raw.code === "CHEF_SELLING_NOT_READY") {
    return { code: raw.code, message: "Your chef account must be approved before publishing dishes." };
  }
  if (status === 503 && raw.code === "CATALOG_ELIGIBILITY_UNAVAILABLE") {
    return { code: raw.code, message: "Publishing could not be checked right now. Please try again shortly." };
  }
  const media = ["MEDIA_STORE_NOT_CONFIGURED", "MEDIA_STORE_CONFIGURATION_FAILED", "MEDIA_FILE_TOO_LARGE",
    "MEDIA_CONTENT_TYPE_NOT_ALLOWED", "MENU_IMAGE_LIMIT_REACHED", "MENU_IMAGE_NOT_FOUND"];
  if (typeof raw.code === "string" && media.includes(raw.code)) return { code: raw.code, message: CHEF_ERROR_MESSAGES[raw.code] };
  return null;
}
