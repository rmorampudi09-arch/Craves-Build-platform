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
  { id: "analytics", label: "Marketplace analytics", group: "Workspace", href: "/admin/analytics", description: "Clickable user, chef and order graphs with complete filtered record lists.", access: "Platform / audit readers", keywords: "users chefs orders charts graphs trends reports" },
  { id: "users", label: "All users", group: "People & kitchens", href: "/admin/explorer/users", description: "All registered identities, role filters and masked contact records.", access: "Audited record explorer", keywords: "users customers identities list" },
  { id: "chef-explorer", label: "All chef applications", group: "People & kitchens", href: "/admin/explorer/chefs", description: "All applications by status, city and creation period.", access: "Audited record explorer", keywords: "chefs applications list graph" },
  { id: "order-explorer", label: "All orders", group: "Orders & delivery", href: "/admin/explorer/orders", description: "Full chef-specific order history with status and source filters.", access: "Audited record explorer", keywords: "orders all history graph" },
  { id: "home-banners", label: "Home banners", group: "Workspace", href: "/admin/banners", description: "Upload, publish and delete the mobile app home banners.", access: "Platform administrator publishing", keywords: "home banner image promotion publish carousel app" },
  { id: "customer-reviews", label: "Customer reviews", group: "Workspace", href: "/admin/reviews", description: "Publish, hide or reject customer reviews before they show in the app.", access: "ADMIN or SUPPORT_ADMIN moderation", keywords: "reviews ratings feedback moderation publish hide reject stars" },
  { id: "search", label: "Global search", group: "Workspace", href: "/admin/search", description: "Find customers, chefs and operational references using the existing audited search.", access: "Audited lookup", keywords: "customer people mobile email payment refund lookup" },
  { id: "modules", label: "All modules", group: "Workspace", href: "/admin/modules", description: "Find the right workspace and understand its available controls.", access: "Navigation", keywords: "directory help controls settings" },
  { id: "operations", label: "Orders & investigations", group: "Orders & delivery", href: "/admin/operations", description: "Investigate order, payment, refund and delivery evidence with an audit reason.", access: "Read-only investigation", keywords: "timeline transaction case reference exceptions" },
  { id: "delivery-exceptions", label: "Delivery exceptions", group: "Orders & delivery", href: "/admin/delivery-exceptions", description: "Open a case when a delivery goes wrong, take ownership, ask for another provider and record how it ended.", access: "Platform and operations admins act; support and audit admins read", keywords: "delivery exception case problem stuck late rider reassign provider borzo pidge escalation incident" },
  { id: "dead-letters", label: "Dead letters", group: "Orders & delivery", href: "/admin/dead-letters", description: "Delivery webhooks, Cashfree webhooks and delivery commands that failed or were given up on, with why. A given-up delivery webhook can be retried once; every view and retry is audited.", access: "Audit reason; platform and operations admins retry", keywords: "dead letter failed webhook cashfree payment callback delivery command retry queue stuck error borzo pidge" },
  { id: "delivery", label: "Delivery Intelligence", group: "Orders & delivery", href: "https://admin.craves.in/delivery-intelligence", description: "Provider selection evidence, delivery history, retries and reconciliation telemetry.", access: "Read-only delivery workspace", keywords: "courier rider provider borzo pidge shadowfax delhivery tracking", externalApp: true },
  { id: "chefs", label: "Chef applications", group: "People & kitchens", href: "/admin/chef-reviews", description: "Review onboarding evidence and record application decisions.", access: "Backend-authorized decisions", keywords: "approve reject kitchen chef onboarding review" },
  { id: "chef-onboarding", label: "Chef onboarding help", group: "People & kitchens", href: "/admin/chef-onboarding", description: "Publish FSSAI articles and videos by language and track chef help requests.", access: "Chef onboarding roles", keywords: "fssai licence license videos articles languages kitchen assistance support" },
  { id: "support", label: "Support inbox", group: "People & kitchens", href: "/admin/support", description: "Reply to customer and chef support tickets, add internal notes and update case status.", access: "Support admin roles", keywords: "support tickets cases help customer chef complaints assistant" },
  { id: "accounts", label: "Account security", group: "People & kitchens", href: "/admin/accounts", description: "Open controlled account-security and intervention workflows.", access: "Backend-authorized actions", keywords: "customer chef account recovery security access" },
  { id: "account-deletions", label: "Deletion requests", group: "People & kitchens", href: "/admin/account-deletions", description: "Review chef deletion requests, see what is still open, and approve or reject.", access: "Backend-authorized decisions", keywords: "delete account deletion erase gdpr play remove close" },
  // Riders & fleet in the order ops works: who to let in, who needs help, the work running now, money, then the pilot's settings.
  { id: "riders", label: "Riders", group: "Riders & fleet", href: "/admin/riders", description: "Start here: applications waiting for review first, then every rider by stage. One step approves an application; new phones and status changes keep due process.", access: "Operations, compliance, payments, support and audit admins", keywords: "rider delivery partner fleet kyc documents selfie phone payout account notice pause suspend audit" },
  { id: "fleet-selfies", label: "Go-online selfies", group: "Riders & fleet", href: "/admin/riders/selfies", description: "Check that the selfie a rider takes to go online shows the rider on file. Rejecting records it; it never ends a shift.", access: "Operations admins", keywords: "rider selfie face photo go online shift identity check review" },
  { id: "fleet-support", label: "Rider support", group: "Riders & fleet", href: "/admin/fleet-support", description: "SOS presses from the last 7 days and riders' problem reports: acknowledge within 24 hours, fix within 72.", access: "Operations and support admins; audit admins can view", keywords: "rider support sos emergency issue problem complaint missing pay wrong distance acknowledge fix" },
  { id: "fleet-trips", label: "Fleet trips & dispatch", group: "Riders & fleet", href: "/admin/fleet-trips", description: "Active trips, the dispatch queue with alerts, reassign or cancel, and where riders are.", access: "Operations, support and audit admins", keywords: "rider trips dispatch queue alerts reassign cancel courier positions location borzo pidge" },
  { id: "fleet-payouts", label: "Rider payouts", group: "Riders & fleet", href: "/admin/fleet-payouts", description: "Weekly and daily IMPS payout files with a second approver, UTRs, failed payouts and pay holds.", access: "Payments and audit admins", keywords: "rider payout imps utr bank file holds withdrawal second approver" },
  { id: "fleet-banner", label: "Rider banner", group: "Riders & fleet", href: "/admin/fleet-banner", description: "Set the banner riders see on Home, like a rain warning. Booked slots were removed in 1.3.4.", access: "Operations admins; support and audit admins can view", keywords: "rider banner rain warning home zone" },
  { id: "fleet-setup", label: "Rider pilot setup", group: "Riders & fleet", href: "/admin/fleet-setup", description: "Publish the rider rate card, switch dispatch off, shadow or live, and choose the pilot riders and kitchens.", access: "Operations admins; support and audit admins can view", keywords: "rider pilot rate card pay terms publish dispatch policy mode shadow live stop test mode allow list kitchens" },
  { id: "fleet-health", label: "Rider pilot health", group: "Riders & fleet", href: "/admin/fleet-health", description: "The pilot's health checks and triggers, run read-only: how fast offers ring, phones that go silent, battery, batching and detours.", access: "Operations, support and audit admins", keywords: "rider pilot health offer ring push fcm silence shift survival battery batching detour trigger stop rule" },
  { id: "finance", label: "Finance", group: "Finance & subscriptions", href: "/admin/finance", description: "Customer payments, refunds, chef earnings, chef and rider payouts, what Craves earned, and the fee and tax settings.", access: "Payments, platform and audit admins", keywords: "money transactions payments refunds payouts utr sales profit ledger earnings commission bank statement settlement tax pricing policy graphs control center" },
  { id: "plans", label: "Subscription plans", group: "Finance & subscriptions", href: "/admin/subscription-plans", description: "Manage the subscription-plan controls exposed by the owning service.", access: "Backend-authorized changes", keywords: "plan menu price subscription" },
  { id: "subscriptions", label: "Subscriptions", group: "Finance & subscriptions", href: "/admin/subscriptions", description: "Inspect subscription status and use existing operational actions.", access: "Backend-authorized actions", keywords: "subscriber recurring status" },
  { id: "capacity", label: "Subscription capacity", group: "Finance & subscriptions", href: "/admin/subscription-capacity", description: "Inspect and manage the existing subscription-capacity workflow.", access: "Backend-authorized changes", keywords: "slots schedule capacity availability" },
  { id: "notifications", label: "Notification recovery", group: "Recovery & learning", href: "/admin/notifications", description: "Inspect failed notifications and use the existing recovery controls.", access: "Guarded recovery", keywords: "email sms messages retry failure" },
  { id: "academy", label: "Craves Academy", group: "Recovery & learning", href: "/admin/academy", description: "Learn Craves services, code, operating procedures and feature development.", access: "Admin learning workspace", keywords: "courses training quiz xp code documentation" },
];

/**
 * The owners' menu (Nov 2026 redesign): nine areas named after people and things, each with tabs.
 * Every tab is an existing route; ADMIN_MODULES above keeps the old names, which All tools and search still understand.
 */
export type AdminAreaId = "today" | "inbox" | "orders" | "customers" | "kitchens" | "riders" | "finance" | "reports" | "settings";
export type AdminArea = { id: AdminAreaId; label: string; href: string };
export type AdminTab = { area: AdminAreaId; label: string; href: string; summary: string; module?: string };

export const ADMIN_AREAS: readonly AdminArea[] = [
  { id: "today", label: "Today", href: "/admin" },
  { id: "inbox", label: "Inbox", href: "/admin/support" },
  { id: "orders", label: "Orders", href: "/admin/orders" },
  { id: "customers", label: "Customers", href: "/admin/search" },
  { id: "kitchens", label: "Kitchens", href: "/admin/chef-reviews" },
  { id: "riders", label: "Riders", href: "/admin/riders" },
  { id: "finance", label: "Finance", href: "/admin/finance" },
  { id: "reports", label: "Reports", href: "/admin/analytics" },
  { id: "settings", label: "Settings", href: "/admin/subscription-capacity" },
];

export const ADMIN_TABS: readonly AdminTab[] = [
  { area: "today", label: "Today", href: "/admin", module: "overview", summary: "What needs you now, most urgent first." },
  { area: "inbox", label: "Help requests", href: "/admin/support", module: "support", summary: "Help requests from customers and chefs. Reply, add a private note, and change the status." },
  { area: "orders", label: "Needs attention", href: "/admin/orders", summary: "Orders that need a person: refunds that failed and orders stuck in one step." },
  { area: "orders", label: "All orders", href: "/admin/explorer/orders", module: "order-explorer", summary: "Every order, with filters, charts and the full list." },
  { area: "orders", label: "Live trips", href: "/admin/fleet-trips", module: "fleet-trips", summary: "Orders waiting for a rider, trips on the road, delivery codes to check and where riders are." },
  { area: "orders", label: "Delivery problems", href: "/admin/delivery-exceptions", module: "delivery-exceptions", summary: "Deliveries that went wrong. Take a case, ask for another delivery company and record how it ended." },
  { area: "orders", label: "Look up an order", href: "/admin/operations", module: "operations", summary: "Find one order, payment, refund or delivery and see what happened to it. Each lookup needs a reason." },
  { area: "orders", label: "Missed delivery & payment updates", href: "/admin/dead-letters", module: "dead-letters", summary: "Updates from delivery companies or Cashfree that our system couldn't process. A given-up delivery update can be tried once more." },
  { area: "customers", label: "Find a customer", href: "/admin/search", module: "search", summary: "Find a customer or chef by phone, email or a reference. Each search needs a reason." },
  { area: "customers", label: "All users", href: "/admin/explorer/users", module: "users", summary: "Everyone with a Craves account, with role filters." },
  { area: "customers", label: "Reviews to publish", href: "/admin/reviews", module: "customer-reviews", summary: "Customer reviews wait here until you publish, hide or reject them." },
  { area: "customers", label: "App home pictures", href: "/admin/banners", module: "home-banners", summary: "The pictures at the top of the customer app's home screen." },
  { area: "kitchens", label: "To approve", href: "/admin/chef-reviews", module: "chefs", summary: "New kitchen applications. Check each document, verify the FSSAI licence, then decide." },
  { area: "kitchens", label: "All kitchens", href: "/admin/explorer/chefs", module: "chef-explorer", summary: "Every kitchen application by status, city and date." },
  { area: "kitchens", label: "Meal plans to approve", href: "/admin/subscription-plans", module: "plans", summary: "Meal plans chefs made. Check the dishes and the schedule, then approve." },
  { area: "kitchens", label: "FSSAI help", href: "/admin/chef-onboarding", module: "chef-onboarding", summary: "Chefs who asked for help with the FSSAI licence, and the articles and videos that explain it." },
  { area: "kitchens", label: "Deletion requests", href: "/admin/account-deletions", module: "account-deletions", summary: "Chefs who asked to close their kitchen and delete their account. Customers delete their own account in the app." },
  { area: "riders", label: "Riders", href: "/admin/riders", module: "riders", summary: "Applications waiting for review first, then every rider by stage." },
  { area: "riders", label: "Selfies to check", href: "/admin/riders/selfies", module: "fleet-selfies", summary: "Riders take a selfie each time they go online. Check it shows the rider on file." },
  { area: "riders", label: "SOS & problems", href: "/admin/fleet-support", module: "fleet-support", summary: "Emergency presses and problems riders reported. Acknowledge within 24 hours, fix within 72." },
  { area: "riders", label: "Live, practice & rain", href: "/admin/fleet-setup", module: "fleet-setup", summary: "Switch orders to Craves riders off, run a practice, or go live, and set rain mode." },
  { area: "riders", label: "Trial setup", href: "/admin/fleet-setup?section=trial", summary: "The riders and kitchens in the trial." },
  { area: "riders", label: "Pay rates", href: "/admin/fleet-setup?section=rates", summary: "What Craves pays riders for each trip. A new rate needs 14 days' notice to riders." },
  { area: "riders", label: "Message to riders", href: "/admin/fleet-banner", module: "fleet-banner", summary: "A short message riders see on their home screen, like a rain warning." },
  { area: "finance", label: "Overview", href: "/admin/finance", module: "finance", summary: "Money in, money out, what delivered orders earned and what chefs are owed." },
  { area: "finance", label: "Transactions", href: "/admin/finance?tab=transactions", summary: "Every payment, refund, chef earning and payout, each with its money trail." },
  { area: "finance", label: "Kitchen payouts", href: "/admin/finance?tab=payouts", summary: "What each chef is owed, bank transfers you record, and payout holds." },
  { area: "finance", label: "Fees & settings", href: "/admin/finance?tab=settings", summary: "Fees, taxes, delivery charges, bank checks and the on/off switches." },
  { area: "finance", label: "Rider pay", href: "/admin/fleet-payouts", module: "fleet-payouts", summary: "Rider pay files with a second approver, bank references (UTRs), failed payouts and pay holds." },
  { area: "finance", label: "Subscriptions", href: "/admin/subscriptions", module: "subscriptions", summary: "Customers' meal plan subscriptions: look one up and change its status." },
  { area: "reports", label: "Reports", href: "/admin/analytics", module: "analytics", summary: "How Craves is growing: users, kitchens and orders, with the full list behind every chart." },
  { area: "settings", label: "Meal plan limits", href: "/admin/subscription-capacity", module: "capacity", summary: "How many meal plan meals each kitchen can take, and stopping new sales for a kitchen." },
  { area: "settings", label: "Block or unblock", href: "/admin/accounts", module: "accounts", summary: "Block or unblock a customer's or chef's account. Each change needs a reason." },
  { area: "settings", label: "Messages not sent", href: "/admin/notifications", module: "notifications", summary: "SMS, emails and app alerts that couldn't be sent, and sending one again." },
  { area: "settings", label: "Rider app health", href: "/admin/fleet-health", module: "fleet-health", summary: "Checks on the Craves Riders app during the trial: alerts, silent phones and battery." },
  { area: "settings", label: "Craves Academy", href: "/admin/academy", module: "academy", summary: "Short courses on how Craves works." },
  { area: "settings", label: "All tools", href: "/admin/modules", module: "modules", summary: "Every tool from the old admin menu, and where it is now." },
];

const tabPath = (tab: AdminTab) => tab.href.split("?")[0];
const tabQuery = (tab: AdminTab) => [...new URLSearchParams(tab.href.split("?")[1] ?? "")];

/** The tab a page belongs to. On a tab's own path, a tab whose query matches wins; deeper paths are that tab's detail pages. */
export function currentAdminTab(pathname: string, search: URLSearchParams | null = null): { tab: AdminTab; detail: boolean } | undefined {
  const params = search ?? new URLSearchParams();
  const own = ADMIN_TABS.filter(tab => tabPath(tab) === pathname);
  const exact = own.find(tab => tabQuery(tab).length > 0 && tabQuery(tab).every(([key, value]) => params.get(key) === value))
    ?? own.find(tab => tabQuery(tab).length === 0);
  if (exact) return { tab: exact, detail: false };
  const parent = ADMIN_TABS.filter(tab => tabPath(tab) !== "/admin" && pathname.startsWith(`${tabPath(tab)}/`) && tabQuery(tab).length === 0)
    .sort((a, b) => tabPath(b).length - tabPath(a).length)[0];
  return parent ? { tab: parent, detail: true } : undefined;
}

export const areaTabs = (area: AdminAreaId) => ADMIN_TABS.filter(tab => tab.area === area);
export const adminArea = (id: AdminAreaId) => ADMIN_AREAS.find(area => area.id === id) ?? ADMIN_AREAS[0];
const lower = (value: string) => value.toLocaleLowerCase("en-IN");

/** The old menu name of a tab, when it differs from the new one ("Dead letters" for Missed delivery & payment updates). */
export function oldAdminName(tab: AdminTab): string | null {
  const old = ADMIN_MODULES.find(module => module.id === tab.module)?.label;
  return old && lower(old) !== lower(tab.label) && lower(old) !== lower(adminArea(tab.area).label) ? old : null;
}

/** Where each old menu tool lives now, for All tools and search. Delivery Intelligence stays a separate app, linked from Reports. */
export function newAdminPlace(module: AdminModule): { label: string; href: string } {
  const tab = ADMIN_TABS.find(item => item.module === module.id);
  if (!tab) return { label: module.externalApp ? "Reports › Delivery Intelligence (opens its own app)" : module.label, href: module.href };
  const area = adminArea(tab.area).label;
  return { label: area === tab.label ? area : `${area} › ${tab.label}`, href: tab.href };
}

export type AdminSearchHit = { label: string; detail: string; href: string; external?: boolean };

/** Search pages by their new names, their old menu names and work words. Every word must match. */
export function searchAdminPages(query: string): AdminSearchHit[] {
  const words = lower(query.trim()).split(/\s+/).filter(Boolean);
  const pages = ADMIN_TABS.map(tab => {
    const owner = ADMIN_MODULES.find(item => item.id === tab.module);
    const area = adminArea(tab.area).label;
    const old = oldAdminName(tab);
    return { hit: { label: area === tab.label ? area : `${area} › ${tab.label}`, detail: old ? `${tab.summary} Old name: ${old}.` : tab.summary, href: tab.href },
      text: `${area} ${tab.label} ${tab.summary} ${owner ? `${owner.label} ${owner.group} ${owner.description} ${owner.keywords}` : ""}` };
  });
  const external = ADMIN_MODULES.filter(module => module.externalApp).map(module => ({
    hit: { label: "Reports › Delivery Intelligence", detail: `${module.description} Opens its own app.`, href: module.href, external: true },
    text: `reports ${module.label} ${module.description} ${module.keywords}` }));
  return [...pages, ...external].filter(page => words.every(word => lower(page.text).includes(word))).map(page => page.hit);
}

/** An order number the owner typed: the 8-character short number customers see, or a full order ID. */
export function adminOrderReference(query: string): { kind: "short" | "full"; value: string } | null {
  const value = query.trim().replace(/^#/, "");
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) return { kind: "full", value: value.toLowerCase() };
  // Part of an order number works too (Finance's Find takes 3 or more); a digit keeps words like "cafe" out.
  if (/^[0-9a-f]{4,8}$/i.test(value) && /\d/.test(value)) return { kind: "short", value: value.toUpperCase() };
  return null;
}

export function matchesAdminRoute(pathname: string, href: string): boolean {
  return href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

/** The one module a page belongs to: the deepest match, so /admin/riders/selfies is Go-online selfies, not Riders. */
export function currentAdminHref(pathname: string): string | undefined {
  return ADMIN_MODULES.filter(module => matchesAdminRoute(pathname, module.href)).map(module => module.href).sort((a, b) => b.length - a.length)[0];
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
