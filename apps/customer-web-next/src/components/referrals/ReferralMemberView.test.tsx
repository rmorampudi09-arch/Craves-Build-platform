import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { overviewSchema } from "@/lib/referrals/contracts";
import { ReferralMemberView, type ReferralMemberViewProps } from "./ReferralMemberView";
const noop = () => {};
const summary = overviewSchema.parse({ asOf: "2026-09-15T00:00:00Z", currency: "INR", pendingPaise: "800", availablePaise: "-1", reservedPaise: "1000", balanceUpdatedAt: "2026-09-15T00:00:00Z", onReviewHold: true, spendingEnabled: false, code: { code: "23456789ABCDEFGH", link: "https://craves.in/r/23456789ABCDEFGH", qrPath: "/api/v1/referrals/me/code/qr" }, levels: [1,2,3].map(level => ({ level, netEarnedPaise: "0" })), downline: [], cashout: { enabled: false, eligible: false, reason: "CASHOUT_DISABLED", minimumPaise: "1000" }, policy: { revision: "2", ratesBps: [200,120,80], capBps: 400, holdDays: 14, minimumPaise: "80000", customerBonusPaise: "40000", inviteeDiscountPaise: "25000", unusedShare: "retain" } });
const props: ReferralMemberViewProps = { summary, rewards: { items: [], nextCursor: null }, cashouts: { items: [], nextCursor: null }, loading: false, problem: "", notice: "", busy: false, fresh: true, active: false, amount: "", confirmed: false, attempt: null, setAmount: noop, setConfirmed: noop, onRefresh: noop, onShare: noop, onWithdraw: noop, onCancel: noop, onMore: noop };
describe("member rendering without a mounted route", () => {
  it("renders exact negative paise, all three rates and the distinct customer budget", () => {
    const html = renderToStaticMarkup(<ReferralMemberView {...props} />);
    for (const text of ["-₹0.01", "1.2%", "0.8%", "₹800.00", "₹400.00", "₹250.00", "outside the seller-chain cap", "account is under review", "No earnings are guaranteed"]) expect(html).toContain(text);
    expect(html).not.toContain("₹2,000/month");
  });
  it("does not fabricate zero balances while loading or display an active rate without policy", () => {
    const loading = renderToStaticMarkup(<ReferralMemberView {...props} summary={null} loading />);
    expect(loading).toContain("Loading your verified"); expect(loading).not.toContain("₹0.00");
    expect(renderToStaticMarkup(<ReferralMemberView {...props} summary={{ ...summary, policy: null }} />)).toContain("No programme policy is active");
  });
  it("shows stale-data and uncertain-payout warnings and no cancel action on submitted money", () => {
    const onCancel = vi.fn();
    const html = renderToStaticMarkup(<ReferralMemberView {...props} fresh={false} onCancel={onCancel} cashouts={{ items: [{ id: "11111111-1111-4111-8111-111111111111", amountPaise: "1000", status: "UNKNOWN", requestedAt: "2026-09-15T00:00:00Z" }], nextCursor: null }} />);
    expect(html).toContain("These values are not current"); expect(html).toContain("Do not request a replacement payment"); expect(html).not.toContain("Cancel reservation"); expect(onCancel).not.toHaveBeenCalled();
  });
});
