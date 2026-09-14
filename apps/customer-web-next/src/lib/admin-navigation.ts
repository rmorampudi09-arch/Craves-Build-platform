/** Navigation describes existing screens, not permissions or service health. */
export type AdminModule = {
  id: string;
  label: string;
  group: string;
  href: string;
  description: string;
  access: string;
  keywords: string;
  externalApp?: boolean;
};

export const ADMIN_MODULES: readonly AdminModule[] = [
  { id: "overview", label: "Overview", group: "Workspace", href: "/admin", description: "Order workload, recent exceptions and operational trends.", access: "Read-only summary", keywords: "dashboard home counts activity" },
  { id: "search", label: "Global search", group: "Workspace", href: "/admin/search", description: "Find customers, chefs and operational references using the existing audited search.", access: "Audited lookup", keywords: "customer people mobile email payment refund lookup" },
  { id: "modules", label: "All modules", group: "Workspace", href: "/admin/modules", description: "Find the right workspace and understand its available controls.", access: "Navigation", keywords: "directory help controls settings" },
  { id: "operations", label: "Orders & investigations", group: "Orders & delivery", href: "/admin/operations", description: "Investigate order, payment, refund and delivery evidence with an audit reason.", access: "Read-only investigation", keywords: "timeline transaction case reference exceptions" },
  { id: "delivery", label: "Delivery Intelligence", group: "Orders & delivery", href: "https://admin.craves.in/delivery-intelligence", description: "Provider selection evidence, delivery history, retries and reconciliation telemetry.", access: "Read-only delivery workspace", keywords: "courier rider provider borzo pidge shadowfax delhivery tracking", externalApp: true },
  { id: "chefs", label: "Chef applications", group: "People & kitchens", href: "/admin/chef-reviews", description: "Review onboarding evidence and record application decisions.", access: "Backend-authorized decisions", keywords: "approve reject kitchen chef onboarding review" },
  { id: "accounts", label: "Account security", group: "People & kitchens", href: "/admin/accounts", description: "Open controlled account-security and intervention workflows.", access: "Backend-authorized actions", keywords: "customer chef account recovery security access" },
  { id: "finance", label: "Finance control center", group: "Finance & subscriptions", href: "/admin/finance", description: "Policy versions, taxes, payout schedules, chef holds and subscription price previews.", access: "Guarded finance workflows", keywords: "ledger earnings commission bank payout statement settlement tax pricing policy" },
  { id: "plans", label: "Subscription plans", group: "Finance & subscriptions", href: "/admin/subscription-plans", description: "Manage the subscription-plan controls exposed by the owning service.", access: "Backend-authorized changes", keywords: "plan menu price subscription" },
  { id: "subscriptions", label: "Subscriptions", group: "Finance & subscriptions", href: "/admin/subscriptions", description: "Inspect subscription status and use existing operational actions.", access: "Backend-authorized actions", keywords: "subscriber recurring status" },
  { id: "capacity", label: "Subscription capacity", group: "Finance & subscriptions", href: "/admin/subscription-capacity", description: "Inspect and manage the existing subscription-capacity workflow.", access: "Backend-authorized changes", keywords: "slots schedule capacity availability" },
  { id: "notifications", label: "Notification recovery", group: "Recovery & learning", href: "/admin/notifications", description: "Inspect failed notifications and use the existing recovery controls.", access: "Guarded recovery", keywords: "email sms messages retry failure" },
  { id: "academy", label: "Craves Academy", group: "Recovery & learning", href: "/admin/academy", description: "Learn Craves services, code, operating procedures and feature development.", access: "Admin learning workspace", keywords: "courses training quiz xp code documentation" },
];

export function matchesAdminRoute(pathname: string, href: string): boolean {
  return href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export function searchAdminModules(query: string): readonly AdminModule[] {
  const words = query.trim().toLocaleLowerCase("en-IN").split(/\s+/).filter(Boolean);
  return ADMIN_MODULES.filter(module => {
    const haystack = `${module.label} ${module.group} ${module.description} ${module.keywords}`.toLocaleLowerCase("en-IN");
    return words.every(word => haystack.includes(word));
  });
}

export function isAdminDestination(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 500 || /[\\\u0000-\u001f\u007f]/.test(value)) return false;
  const path = value.split(/[?#]/, 1)[0];
  return path === "/admin" || path.startsWith("/admin/") || path === "/delivery-intelligence" || path.startsWith("/delivery-intelligence/");
}

export function formatAdminTimestamp(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Not available";
  return `${new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(date)} IST`;
}

export function readableAdminStatus(value: string): string {
  return value.toLowerCase().replaceAll("_", " ").replace(/^./, letter => letter.toUpperCase());
}

export function adminMetricCsv(metrics: Readonly<Record<string, number>>, generatedAt: string): string {
  const cell = (value: string) => `"${value.replaceAll('"', '""')}"`;
  // Export only aggregate, fixed-name counters. No customer/chef identifiers or secrets.
  const rows = Object.entries(metrics).filter(([key, value]) => /^[a-zA-Z][a-zA-Z0-9]*$/.test(key) && Number.isSafeInteger(value) && value >= 0);
  return ["metric,count,snapshot_utc", ...rows.map(([key, value]) => `${cell(key)},${value},${cell(new Date(generatedAt).toISOString())}`)].join("\r\n");
}
