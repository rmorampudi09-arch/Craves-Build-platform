import assert from "node:assert/strict";
import test from "node:test";
import type { ChefEarning } from "./chef-earnings-contract.ts";
import type { ChefOrder, ChefOrderStatus } from "./chef-order-contract.ts";
import {
  DAY_MS,
  earningsPreviousBounds,
  earningsRangeBounds,
  istDayFromInput,
  istDayName,
  istDayStart,
  istInputValue,
  olderOrdersMissing,
  ordersCoverFrom,
  ordersOnDay,
  periodText,
  summarizeEarnings,
} from "./chef-earnings-insights.ts";
import { groupByMonth, payoutStatusView } from "./chef-payout-presentation.ts";

const at = (iso: string) => Date.parse(iso);
// Thu 15 Oct 2026, 10:00 in India.
const NOW = at("2026-10-15T04:30:00Z");

function earning(
  createdAt: string,
  netPayable: number,
  status: ChefEarning["status"] = "APPROVED",
): ChefEarning {
  return {
    id: crypto.randomUUID(),
    orderId: crypto.randomUUID(),
    orderSource: "ON_DEMAND",
    currency: "INR",
    grossAmount: netPayable,
    commissionAmount: 0,
    taxWithheldAmount: 0,
    adjustmentAmount: 0,
    netPayable,
    allocationReference: "ref",
    status,
    reason: "",
    approvedAt: null,
    reversedAt: null,
    createdAt,
    updatedAt: createdAt,
  };
}
function order(
  updatedAt: string,
  status: ChefOrderStatus = "DELIVERED",
  items: [string, number, number][] = [],
  createdAt = updatedAt,
): ChefOrder {
  return {
    id: crypto.randomUUID(),
    kitchenName: null,
    status,
    currency: "INR",
    foodSubtotal: 0,
    platformFee: 0,
    taxAmount: 0,
    deliveryFee: 0,
    grandTotal: 0,
    chefResponseNote: null,
    prepTimeMinutes: null,
    deliveryAddress: null,
    createdAt,
    updatedAt,
    items: items.map(([itemName, quantity, lineTotal]) => ({
      id: crypto.randomUUID(),
      menuItemId: `menu-${itemName}`,
      itemName,
      category: null,
      foodType: null,
      unitPrice: lineTotal / quantity,
      quantity,
      lineTotal,
    })),
  };
}

test("India days whatever the browser's zone", () => {
  // 16 Oct 01:30 in India is still 15 Oct in UTC.
  assert.equal(istDayStart(at("2026-10-15T20:00:00Z")), at("2026-10-15T18:30:00Z"));
  assert.equal(istDayStart(at("2026-10-15T18:29:59Z")), at("2026-10-14T18:30:00Z"));
  assert.equal(istDayFromInput("2026-10-12"), at("2026-10-11T18:30:00Z"));
  for (const bad of ["2026-02-30", "2026-1-2", "", "12/10/2026"])
    assert.equal(istDayFromInput(bad), null, bad);
  assert.equal(istInputValue(at("2026-10-15T20:00:00Z")), "2026-10-16");
  assert.equal(istDayName(istDayStart(NOW), NOW), "Today");
  assert.equal(istDayName(istDayStart(NOW) - DAY_MS, NOW), "Yesterday");
  assert.equal(istDayName(istDayStart(NOW) - 3 * DAY_MS, NOW), "Mon, 12 Oct");
});

test("periods and the period before", () => {
  const today = at("2026-10-14T18:30:00Z");
  assert.deepEqual(earningsRangeBounds("today", NOW), { from: today, to: today + DAY_MS });
  assert.deepEqual(earningsRangeBounds("week", NOW), {
    from: today - 6 * DAY_MS,
    to: today + DAY_MS,
  });
  assert.deepEqual(earningsRangeBounds("month", NOW), {
    from: at("2026-09-30T18:30:00Z"),
    to: today + DAY_MS,
  });
  // Picked backwards: still the same whole days.
  assert.deepEqual(earningsRangeBounds({ from: today, to: today - 2 * DAY_MS + 5 }, NOW), {
    from: today - 2 * DAY_MS,
    to: today + DAY_MS,
  });
  assert.deepEqual(earningsPreviousBounds("week", NOW), {
    from: today - 13 * DAY_MS,
    to: today - 6 * DAY_MS,
  });
  assert.deepEqual(earningsPreviousBounds("month", NOW), {
    from: at("2026-08-31T18:30:00Z"),
    to: at("2026-09-15T18:30:00Z"),
  });
  // 31 days of March compare with February only, never running into March.
  assert.deepEqual(earningsPreviousBounds("month", at("2027-03-31T06:00:00Z")), {
    from: at("2027-01-31T18:30:00Z"),
    to: at("2027-02-28T18:30:00Z"),
  });
  assert.equal(periodText(earningsRangeBounds("week", NOW)), "9 Oct – 15 Oct");
  assert.equal(periodText(earningsRangeBounds("today", NOW)), "15 Oct");
});

test("the week's summary: money from earnings, counts and dishes from orders", () => {
  const earnings = [
    earning("2026-10-15T03:00:00Z", 300),
    earning("2026-10-14T03:00:00Z", 200.5, "SETTLED"),
    earning("2026-10-14T03:00:00Z", 999, "DRAFT"),
    earning("2026-10-13T03:00:00Z", 50, "REVERSED"),
    earning("2026-10-05T03:00:00Z", 400),
  ];
  const orders = [
    order("2026-10-15T03:00:00Z", "DELIVERED", [
      ["Biryani", 2, 360],
      ["Raita", 1, 40],
    ]),
    order("2026-10-14T03:00:00Z", "DELIVERED", [["biryani ", 1, 180]]),
    order("2026-10-14T05:00:00Z", "CANCELLED"),
    order("2026-10-13T05:00:00Z", "REFUNDED"),
    order("2026-10-12T05:00:00Z", "CHEF_REJECTED"),
    order("2026-10-05T05:00:00Z", "DELIVERED"),
  ];
  const summary = summarizeEarnings({ orders, earnings, range: "week", now: NOW });
  assert.equal(summary.earned, 500.5);
  assert.equal(summary.delivered, 2);
  assert.equal(summary.averageOrder, 250.25);
  assert.equal(summary.changeVsPrevious, 25);
  assert.equal(summary.deliveredChange, 1);
  assert.deepEqual(summary.split, { delivered: 2, cancelled: 2, rejected: 1 });
  assert.deepEqual(
    summary.byDay.map((day) => day.label),
    ["Fri", "Sat", "Sun", "Mon", "Tue", "Wed", "Today"],
  );
  assert.deepEqual(
    summary.byDay.slice(-2).map((day) => day.amount),
    [200.5, 300],
  );
  assert.deepEqual(summary.topDishes, [
    { name: "Biryani", sold: 3, amount: 540, menuItemId: "menu-Biryani" },
    { name: "Raita", sold: 1, amount: 40, menuItemId: "menu-Raita" },
  ]);

  // A full earnings list that doesn't reach the period before: no comparison at all.
  const cut = summarizeEarnings({
    orders,
    earnings: earnings.slice(0, 4),
    range: "week",
    now: NOW,
    earningsLimit: 4,
  });
  assert.equal(cut.changeVsPrevious, null);
  assert.equal(cut.deliveredChange, null);
  assert.equal(
    summarizeEarnings({ orders, earnings, range: "week", now: NOW, ordersCutOff: true })
      .deliveredChange,
    null,
  );
  // Nothing earned before: no percentage.
  assert.equal(
    summarizeEarnings({ orders, earnings: earnings.slice(0, 2), range: "week", now: NOW })
      .changeVsPrevious,
    null,
  );
  // A month has numbered days.
  assert.deepEqual(
    summarizeEarnings({ orders, earnings, range: "month", now: NOW })
      .byDay.slice(0, 2)
      .map((day) => day.label),
    ["1", "2"],
  );
});

test("a day's orders and how far back the orders reach", () => {
  const late = order("2026-10-14T18:00:00Z"),
    early = order("2026-10-14T00:00:00Z"),
    tomorrow = order("2026-10-14T19:00:00Z");
  assert.deepEqual(ordersOnDay([early, tomorrow, late], at("2026-10-14T06:00:00Z")), [late, early]);

  const from = at("2026-10-01T00:00:00Z");
  const recent = [order("2026-10-10T00:00:00Z")],
    old = [order("2026-09-20T00:00:00Z")];
  assert.equal(olderOrdersMissing({ historyOrders: recent, hasMore: true, from }), true);
  assert.equal(olderOrdersMissing({ historyOrders: recent, hasMore: false, from }), false);
  assert.equal(olderOrdersMissing({ historyOrders: old, hasMore: true, from }), false);
  assert.equal(
    ordersCoverFrom({
      liveOrders: old,
      historyOrders: [],
      hasMore: true,
      historyFailed: true,
      from,
    }),
    true,
  );
  assert.equal(
    ordersCoverFrom({
      liveOrders: recent,
      historyOrders: recent,
      hasMore: false,
      historyFailed: false,
      from,
    }),
    true,
  );
  assert.equal(
    ordersCoverFrom({
      liveOrders: recent,
      historyOrders: recent,
      hasMore: true,
      historyFailed: false,
      from,
    }),
    false,
  );
  assert.equal(
    ordersCoverFrom({
      liveOrders: recent,
      historyOrders: [],
      hasMore: false,
      historyFailed: false,
      from,
    }),
    false,
  );
  assert.equal(
    ordersCoverFrom({
      liveOrders: recent,
      historyOrders: recent,
      hasMore: false,
      historyFailed: true,
      from,
    }),
    false,
  );
});

test("payout history words and India-month groups", () => {
  assert.equal(payoutStatusView("PAID").label, "Paid");
  assert.equal(payoutStatusView("PENDING_APPROVAL").label, "Craves is checking");
  const rows = [
    "2026-10-02T10:00:00Z",
    "2026-09-30T19:00:00Z",
    "2026-09-30T10:00:00Z",
    "2025-12-01T10:00:00Z",
    "nope",
  ];
  assert.deepEqual(
    groupByMonth(rows, (row) => row, NOW).map((group) => [group.title, group.items.length]),
    [
      ["October", 2],
      ["September", 1],
      ["December 2025", 1],
      ["Earlier", 1],
    ],
  );
});
