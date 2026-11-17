/** The main places a customer moves between; the phone tab bar marks the one each page belongs to. */
export type NavSection = "home" | "subscriptions" | "chefs" | "orders" | "notifications" | "profile" | "cart";

const under = (pathname: string, prefixes: readonly string[]) =>
  prefixes.some((prefix) => pathname === prefix || pathname.startsWith(prefix + "/"));

// Pages reached from Profile, as in the app (its Profile stack holds food lists, group orders and settings).
const PROFILE_PAGES = ["/profile", "/lists", "/l", "/group-orders", "/g", "/wishlist", "/addresses", "/settings", "/help", "/refer", "/account"];

/** Which main place a page belongs to, so the header and the tab bar mark it; null for pages outside them. */
export function navSectionForPath(pathname: string): NavSection | null {
  if (under(pathname, ["/cart"])) return "cart";
  if (under(pathname, ["/subscriptions"])) return "subscriptions";
  if (under(pathname, ["/chefs", "/kitchen", "/kitchens"])) return "chefs";
  if (under(pathname, ["/orders", "/tracking"])) return "orders";
  if (under(pathname, ["/notifications"])) return "notifications";
  if (under(pathname, PROFILE_PAGES)) return "profile";
  if (under(pathname, ["/home", "/dish", "/search", "/discover", "/food"])) return "home";
  return null;
}
