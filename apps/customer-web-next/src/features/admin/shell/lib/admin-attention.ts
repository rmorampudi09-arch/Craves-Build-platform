/**
 * What needs an owner now, from the endpoints the admin already has (no counts endpoint yet).
 * A source that fails is never shown as zero: its row says it couldn't be checked.
 */
/** `oldest` is when the longest-waiting item came in, when the source can tell. */
export type Source<T> = { state: "loading" } | { state: "ok"; value: T; more?: boolean; oldest?: string } | { state: "failed" } | { state: "hidden" };

export type OrderFlow = {
  statusCounts: Array<{ status: string; count: number }>;
  orderTrend: Array<{ date: string; count: number }>;
  recent: Array<{ orderId: string; kitchenName: string | null; status: string; updatedAt: string }>;
  refundFailed: number; readyForPickup: number;
};

export type AttentionData = {
  checkedAt: number | null;
  orders: Source<OrderFlow>;
  refundsFailed: Source<number>;
  readyForPickup: Source<number>;
  deliveryProblems: Source<number>;
  kitchens: Source<number>;
  mealPlans: Source<number>;
  chefHelp: Source<number>;
  helpRequests: Source<number>;
  riders: Source<number>;
  selfies: Source<number>;
  riderProblems: Source<{ open: number; late: number }>;
  sos: Source<{ riderName: string; at: string; alerted: boolean }[]>;
  riderPay: Source<number>;
  payouts: Source<{ toConfirm: number; failed: number; onHold: number }>;
  dispatch: Source<"off" | "shadow" | "live" | null>;
  rain: Source<"off" | "on" | "severe">;
};

export const LOADING: AttentionData = {
  checkedAt: null, orders: { state: "loading" },
  refundsFailed: { state: "loading" }, readyForPickup: { state: "loading" }, deliveryProblems: { state: "loading" },
  kitchens: { state: "loading" }, mealPlans: { state: "loading" }, chefHelp: { state: "loading" }, helpRequests: { state: "loading" },
  riders: { state: "loading" }, selfies: { state: "loading" }, riderProblems: { state: "loading" }, sos: { state: "loading" },
  riderPay: { state: "loading" }, payouts: { state: "loading" }, dispatch: { state: "loading" }, rain: { state: "loading" },
};

/** The words the customer app uses for each order status. */
const STATUS_WORDS: Readonly<Record<string, string>> = {
  PAYMENT_PENDING: "Payment pending", PAID: "Awaiting kitchen", CHEF_ACCEPTANCE_PENDING: "Awaiting kitchen", CHEF_ACCEPTED: "Accepted", PREPARING: "Preparing", READY_FOR_PICKUP: "Ready for pickup", OUT_FOR_DELIVERY: "Item picked up",
  DELIVERED: "Delivered", REFUND_PENDING: "Refund pending", REFUNDED: "Refunded", REFUND_FAILED: "Refund needs attention", CHEF_REJECTED: "Kitchen declined", CANCELLED: "Cancelled",
};
export const orderStatusWords = (status: string) => STATUS_WORDS[status] ?? status.toLowerCase().replaceAll("_", " ").replace(/^./, letter => letter.toUpperCase());

/** The last seven days of the order trend, labelled by weekday, with today's bar called "Today". */
export function lastWeek(trend: OrderFlow["orderTrend"], now = Date.now()): Array<{ label: string; full: string; count: number }> {
  const today = new Date(now + 5.5 * 3_600_000).toISOString().slice(0, 10);
  return [...trend].sort((a, b) => a.date.localeCompare(b.date)).slice(-7).map(point => {
    const day = new Date(`${point.date}T00:00:00Z`);
    const isToday = point.date === today;
    return { label: isToday ? "Today" : new Intl.DateTimeFormat("en-IN", { weekday: "short", timeZone: "UTC" }).format(day),
      full: isToday ? "today" : new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(day), count: point.count };
  });
}

/** An SOS press counts as urgent for this long; older presses stay on Riders › SOS & problems. */
export const SOS_WINDOW_MS = 60 * 60 * 1000;
/** A press whose alert email never went stays up for a day: nobody else was told about it. */
export const UNALERTED_SOS_WINDOW_MS = 24 * 60 * 60 * 1000;

export function recentSos(data: AttentionData, now = Date.now()) {
  return data.sos.state === "ok" ? data.sos.value.filter(event => now - Date.parse(event.at) < (event.alerted ? SOS_WINDOW_MS : UNALERTED_SOS_WINDOW_MS)) : [];
}

export function ago(iso: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

export type TodayRow = {
  key: string; href: string; action: string;
  count: number | null; more?: boolean; label: string; note: string;
  urgent?: boolean; failed?: boolean;
  /** How the day's summary line names an urgent row: "the SOS", "the 3 failed refunds". */
  lead?: string;
};

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

/**
 * Today's rows, most urgent first. Zero rows come back separately so the page folds them into one line, and a failed source
 * becomes a "couldn't check" row so it is never read as nothing waiting.
 */
export function todayRows(data: AttentionData, now = Date.now()): { rows: TodayRow[]; nothing: string[] } {
  const rows: TodayRow[] = [];
  const nothing: string[] = [];
  function add<T>(source: Source<T>, count: (value: T) => number, row: (value: T, n: number) => Omit<TodayRow, "count" | "failed" | "more">, zero: string, name: string, href: string) {
    if (source.state === "hidden" || source.state === "loading") return;
    if (source.state === "failed") { rows.push({ key: name, href, action: "Open", count: null, failed: true, label: `${name}: couldn't check`, note: "Some may be waiting. Try again in a minute, or open the page." }); return; }
    const n = count(source.value);
    // A partial list (more to load) can't name its oldest item, so it says nothing rather than something wrong.
    const made = row(source.value, n);
    if (n > 0) rows.push({ ...made, note: source.oldest && !source.more ? `${made.note.replace(/\.?$/, ".")} Oldest: ${ago(source.oldest, now)}.` : made.note, count: n, more: source.more });
    else nothing.push(zero);
  }
  const sos = recentSos(data, now);
  if (sos.length) rows.push({ key: "sos", href: "/admin/fleet-support", action: "Open", count: sos.length, urgent: true, lead: "the SOS",
    label: plural(sos.length, "rider pressed SOS", "SOS presses"),
    note: `${sos[0].riderName} · ${ago(sos[0].at, now)} · ${sos[0].alerted ? "the alert email was sent" : "the alert email hasn't gone yet"}` });
  if (data.sos.state === "failed") rows.push({ key: "sos", href: "/admin/fleet-support", action: "Open", count: null, failed: true,
    label: "SOS presses: couldn't check", note: "A rider may need help. Open SOS & problems to see the latest presses." });
  add(data.refundsFailed, n => n, (_, n) => ({ key: "refunds", href: "/admin/orders", action: "Review", urgent: true, lead: n === 1 ? "the failed refund" : `the ${n} failed refunds`,
    label: plural(n, "refund failed", "refunds failed"), note: "Customers haven't got their money back. Check each one in Cashfree, then tell the customer." }),
  "failed refunds", "Failed refunds", "/admin/orders");
  add(data.readyForPickup, n => n, (_, n) => ({ key: "ready", href: "/admin/orders", action: "Review",
    label: plural(n, "order is in Ready for pickup", "orders are in Ready for pickup"), note: "Normal for a few minutes while a rider comes. If one has waited long, call the kitchen: was the food collected?" }),
  "orders in Ready for pickup", "Orders in Ready for pickup", "/admin/orders");
  add(data.deliveryProblems, n => n, (_, n) => ({ key: "cases", href: "/admin/delivery-exceptions", action: "Open",
    label: plural(n, "delivery problem is open", "delivery problems are open"), note: "Take the case, ask for another delivery company if needed, and record how it ended." }),
  "delivery problems", "Delivery problems", "/admin/delivery-exceptions");
  add(data.riderPay, n => n, (_, n) => ({ key: "rider-pay", href: "/admin/fleet-payouts", action: "Approve",
    label: plural(n, "rider pay file needs a second approval", "rider pay files need a second approval"), note: "Made by one owner. The other owner approves before it goes to the bank." }),
  "rider pay to approve", "Rider pay", "/admin/fleet-payouts");
  add(data.payouts, value => value.failed + value.toConfirm + value.onHold, value => ({ key: "payouts", href: "/admin/finance?tab=payouts", action: "Open", urgent: value.failed > 0, lead: "the failed kitchen payouts",
    label: "kitchen payouts need a look",
    note: [value.failed && `${value.failed} ${plural(value.failed, "payout failed", "payouts failed")}`,
      value.toConfirm && `${value.toConfirm} waiting for the bank`,
      value.onHold && `${value.onHold} ${plural(value.onHold, "kitchen", "kitchens")} on hold`].filter(Boolean).join(" · ") }),
  "kitchen payouts", "Kitchen payouts", "/admin/finance?tab=payouts");
  add(data.kitchens, n => n, (_, n) => ({ key: "kitchens", href: "/admin/chef-reviews", action: "Review",
    label: plural(n, "kitchen application to check", "kitchen applications to check"), note: "Check the documents, verify the FSSAI licence, then decide." }),
  "kitchens to check", "Kitchen applications", "/admin/chef-reviews");
  add(data.mealPlans, n => n, (_, n) => ({ key: "plans", href: "/admin/subscription-plans", action: "Review",
    label: plural(n, "meal plan to approve", "meal plans to approve"), note: "Check the dishes and the schedule." }),
  "meal plans to approve", "Meal plans", "/admin/subscription-plans");
  add(data.riders, n => n, (_, n) => ({ key: "riders", href: "/admin/riders", action: "Review",
    label: plural(n, "rider application to check", "rider applications to check"), note: "Check the photos and the payout account, then approve or send the fixes." }),
  "riders to approve", "Rider applications", "/admin/riders");
  add(data.selfies, n => n, (_, n) => ({ key: "selfies", href: "/admin/riders/selfies", action: "Check",
    label: plural(n, "rider selfie to check", "rider selfies to check"), note: "The rider keeps working. Check the face matches the rider on file." }),
  "rider selfies", "Rider selfies", "/admin/riders/selfies");
  add(data.helpRequests, n => n, (_, n) => ({ key: "help", href: "/admin/support", action: "Reply",
    label: plural(n, "help request is open", "help requests are open"), note: "From customers and chefs. Reply, or add a private note." }),
  "help requests", "Help requests", "/admin/support");
  add(data.chefHelp, n => n, (_, n) => ({ key: "chef-help", href: "/admin/chef-onboarding", action: "Call",
    label: plural(n, "chef asked for FSSAI help", "chefs asked for FSSAI help"), note: "Call the chef, then mark the request contacted or resolved." }),
  "FSSAI call-backs", "FSSAI help requests", "/admin/chef-onboarding");
  add(data.riderProblems, value => value.open, value => ({ key: "rider-problems", href: "/admin/fleet-support", action: "Open", urgent: value.late > 0, lead: "the late rider problems",
    label: plural(value.open, "rider problem is open", "rider problems are open"),
    note: value.late ? `${value.late} past the 24-hour reply promise` : "Acknowledge within 24 hours, fix within 72." }),
  "rider problems", "Rider problems", "/admin/fleet-support");
  if (data.dispatch.state === "failed" || data.rain.state === "failed") rows.push({ key: "rider-mode", href: "/admin/fleet-setup", action: "Open", count: null, failed: true,
    label: "Riders' delivery mode: couldn't check", note: "Practice run, rain mode or off may be on. Open Live, practice & rain to see." });
  // Failed sources sit after waiting work, so a "couldn't check" row never pushes an urgent one down.
  return { rows: [...rows.filter(row => !row.failed), ...rows.filter(row => row.failed)], nothing };
}

/** The bold line under Today's date. A check that failed is never summed up as "nothing waiting". */
export function todayFinding(rows: readonly TodayRow[]): string {
  const urgent = rows.filter(row => row.urgent && !row.failed);
  if (urgent.length) return `Start with ${urgent.slice(0, 2).map(row => row.lead ?? row.label).join(", then ")}.`;
  const unchecked = rows.some(row => row.failed);
  if (rows.some(row => !row.failed)) return unchecked ? "Nothing is urgent in what could be checked." : "Nothing is urgent. The list is in order.";
  return unchecked ? "Some checks couldn't run, so work may be waiting. See the rows marked “couldn't check”." : "Nothing is waiting for you.";
}

/** Riders' delivery state when it isn't the normal "live": a practice run, heavy rain, or off (Borzo and Pidge deliver every order). */
export function riderState(data: AttentionData): { text: string; note: string; everyPage: boolean } | null {
  const mode = data.dispatch.state === "ok" ? data.dispatch.value : null;
  const rain = data.rain.state === "ok" ? data.rain.value : null;
  if (mode === "shadow") return { text: "Craves riders are on a practice run", note: "Craves only writes down which rider it would have offered each order to. Riders get nothing, and Borzo and Pidge deliver every order until you go live.", everyPage: true };
  if (rain === "severe") return { text: "Heavy rain mode is on", note: "New orders go straight to Borzo or Pidge.", everyPage: true };
  // Off is also the normal state before the rider trial starts, so it shows on Today only, not as a bar on every page.
  if (mode === "off") return { text: "Craves riders are off", note: "Borzo and Pidge deliver every order until you go live.", everyPage: false };
  return null;
}

/** Menu badges: how many things wait in each area. Failed or hidden sources add nothing. */
export function areaCounts(data: AttentionData, now = Date.now()): Partial<Record<"inbox" | "orders" | "kitchens" | "riders" | "finance", { count: number; urgent: boolean }>> {
  const n = <T,>(source: Source<T>, pick: (value: T) => number) => (source.state === "ok" ? pick(source.value) : 0);
  const sos = recentSos(data, now).length;
  const result = {
    inbox: { count: n(data.helpRequests, v => v), urgent: false },
    orders: { count: n(data.refundsFailed, v => v) + n(data.deliveryProblems, v => v), urgent: n(data.refundsFailed, v => v) > 0 },
    kitchens: { count: n(data.kitchens, v => v) + n(data.mealPlans, v => v) + n(data.chefHelp, v => v), urgent: false },
    riders: { count: sos + n(data.riders, v => v) + n(data.selfies, v => v) + n(data.riderProblems, v => v.open), urgent: sos > 0 || n(data.riderProblems, v => v.late) > 0 },
    finance: { count: n(data.riderPay, v => v) + n(data.payouts, v => v.failed + v.toConfirm + v.onHold), urgent: n(data.payouts, v => v.failed) > 0 },
  };
  return Object.fromEntries(Object.entries(result).filter(([, value]) => value.count > 0));
}
