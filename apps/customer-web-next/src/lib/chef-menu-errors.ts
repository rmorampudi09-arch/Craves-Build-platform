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
  const media: Record<string, string> = {
    MEDIA_STORE_NOT_CONFIGURED: "Photo storage is not available yet. Your dish details are saved; add photos once it is fixed.",
    MEDIA_STORE_CONFIGURATION_FAILED: "Photo storage is not available yet. Your dish details are saved; add photos once it is fixed.",
    MEDIA_FILE_TOO_LARGE: "This photo is larger than 8 MB. Choose a smaller photo.",
    MEDIA_CONTENT_TYPE_NOT_ALLOWED: "Use a JPEG, PNG or WebP photo.",
    MENU_IMAGE_LIMIT_REACHED: "This dish already has 5 photos.",
  };
  if (typeof raw.code === "string" && media[raw.code]) return { code: raw.code, message: media[raw.code] };
  return null;
}
