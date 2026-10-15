/** A chef picture the browser may load: an https URL from the server, else null. */
export function safeChefPhotoUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const candidate = value.trim();
  if (!candidate || candidate.length > 2000) return null;
  try { return new URL(candidate).protocol === "https:" ? candidate : null; } catch { return null; }
}

/** Up to two uppercase initials ("Asha Rao" -> "AR"), "" when the name has none. */
export function chefInitials(name: string | null | undefined): string {
  return (name ?? "").trim().split(/\s+/).slice(0, 2).map(word => Array.from(word)[0] ?? "").join("").toUpperCase();
}
