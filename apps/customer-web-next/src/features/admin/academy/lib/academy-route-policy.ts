/** No open proxy: both method/path and the complete query are allowlisted. */
export function academyRoute(method: string, parts: string[], query: URLSearchParams): string | null {
  if (!parts.length || parts.some(p => !/^[a-z0-9-]+$/.test(p))) return null;
  const path = parts.join("/");
  const allowed = method === "GET" ? /^(catalog|me|plans|analytics|sources\/[a-z0-9-]+\/[0-9])$/ : method === "POST" ? /^(attempts|events)$/ : method === "PUT" ? /^(preferences|plans)$/ : method === "DELETE" ? /^plans\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/ : null;
  if (!allowed?.test(path)) return null;
  const entries = [...query.entries()];
  const permitted = path === "analytics" ? "page" : method === "DELETE" ? "revision" : null;
  if (entries.length > 1 || entries.some(([key, value]) => key !== permitted || !/^\d{1,7}$/.test(value))) return null;
  if (method === "DELETE" && (!query.has("revision") || Number(query.get("revision")) < 1)) return null;
  if (path === "analytics" && Number(query.get("page") || 0) > 10000) return null;
  return `${path}${entries.length ? `?${query.toString()}` : ""}`;
}
