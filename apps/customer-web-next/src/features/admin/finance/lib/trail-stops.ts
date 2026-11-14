import { earningWait, fromPaise, isZero, paise, rupees as money, statusOf, type ChefOrder, type OrderTrail, type PayoutTrail } from "@/features/admin/finance/lib/insights-contract";

/** One stop on the money trail. `done` is filled, `waiting` is hollow, `problem` is red, `skipped` never happened. */
export type Stop = { key: string; title: string; at: string | null; state: "done" | "waiting" | "problem" | "skipped"; note?: string;
  sum?: [label: string, amount: string, sign?: "-"][]; payoutId?: string };

const add = (...amounts: string[]) => fromPaise(amounts.reduce((total, amount) => total + paise(amount), 0n));

/** The trail of one kitchen's order inside a checkout: customer payment, the split, delivery, the chef's earning, the bank. */
export function orderStops(trail: OrderTrail, order: ChefOrder | null, now = Date.now()): Stop[] {
  const stops: Stop[] = [];
  const paid = trail.payments.find(payment => payment.status === "PAID"), last = trail.payments.at(-1);
  if (paid) stops.push({ key: "paid", title: `Customer paid ${money(paid.amount)}`, at: paid.updatedAt, state: "done",
    note: sentences(paid.provider === "REFERRAL_WALLET" ? "Paid from referral credit" : `${titleCase(paid.provider)} payment ${paid.providerPaymentId ?? paid.reference}`,
      trail.orders.length > 1 && `This one payment covers ${trail.orders.length} kitchens' orders`, !paid.recordedAt && "Not yet entered in the books") });
  else stops.push({ key: "paid", title: "Customer has not paid", at: last?.updatedAt ?? null, state: last?.status === "FAILED" ? "problem" : "waiting",
    note: last ? `Latest attempt: ${statusOf("CUSTOMER_PAYMENT", last.status).label.toLowerCase()}.` : "No payment was started for this order." });

  const split = order?.split ?? null;
  if (split) stops.push({ key: "split", title: `Order total ${money(split.customerTotal)}`, at: null, state: "done", sum: [
    ["Food", split.customerFood], ["Delivery", split.delivery], ...(isZero(split.platformFee) ? [] : [["Platform fee", split.platformFee] as [string, string]]),
    ["GST", add(split.foodGst, split.deliveryGst, split.platformGst)], ["Customer pays", split.customerTotal]] });
  else stops.push({ key: "split", title: "Order total not recorded", at: null, state: "skipped", note: "Earnings were not being recorded when this order was placed, so its split is not known here." });

  const refunds = () => {
    for (const refund of trail.refunds.filter(item => !order || item.chefOrderId === order.chefOrderId || (item.chefOrderId === null && trail.orders.length === 1))) {
      const status = statusOf("REFUND", refund.status);
      stops.push({ key: `refund-${refund.id}`, title: `Refund of ${money(refund.amount)}: ${status.label.toLowerCase()}`, at: refund.processedAt ?? refund.requestedAt,
        state: status.tone === "success" ? "done" : status.tone === "danger" ? "problem" : "waiting",
        note: sentences(refund.reason, refund.providerRefundId && `Refund ID ${refund.providerRefundId}`) || undefined });
    }
    return stops;
  };
  if (!order) return refunds();
  const delivery = order.delivery, rider = delivery?.riderName ? `Delivered by ${delivery.riderName}${delivery.riderPay ? `, rider pay ${money(delivery.riderPay)}` : ""}.` : "";
  if (order.state === "DELIVERED" || order.deliveredAt) stops.push({ key: "delivered", title: "Delivered", at: order.deliveredAt, state: "done", note: rider || undefined });
  else if (order.state === "CANCELLED") stops.push({ key: "delivered", title: "Order cancelled", at: null, state: "skipped", note: "Nothing is owed to the chef for a cancelled order." });
  else if (order.state === "REVIEW_REQUIRED") stops.push({ key: "delivered", title: "Held for a check", at: null, state: "problem", note: earningWait(order) });
  else if (split) stops.push({ key: "delivered", title: "Not delivered yet", at: null, state: "waiting" });
  else if (delivery) stops.push({ key: "delivered", title: delivery.state === "DELIVERED" ? "Delivered" : "Delivery", at: null, state: delivery.state === "DELIVERED" ? "done" : "waiting", note: rider || undefined });

  if (split && order.earningRecordedAt) stops.push({ key: "earned", title: `Chef earned ${money(split.chefPayable)}`, at: order.earningRecordedAt, state: "done", sum: [
    ["Food at the chef's price", split.chefGross], ["Craves service fee", split.chefServiceFee, "-"], ["GST on that fee", split.chefFeeGst, "-"],
    ...(isZero(split.withholding) ? [] : [["TDS held back", split.withholding, "-"] as [string, string, "-"]]), ["Chef gets", split.chefPayable]] });
  else if (split && order.state !== "CANCELLED") stops.push({ key: "earned", title: `Chef will earn ${money(split.chefPayable)}`, at: null,
    state: order.state === "REVIEW_REQUIRED" ? "problem" : "waiting", note: earningWait(order) });

  const payout = order.payout;
  if (payout) {
    const status = statusOf("CHEF_PAYOUT", payout.status);
    stops.push({ key: "bank", title: payout.status === "PAID" ? "Paid to the chef's bank" : `Payout: ${status.label.toLowerCase()}`, at: payout.paidAt ?? payout.createdAt,
      state: payout.status === "PAID" ? "done" : status.tone === "danger" ? "problem" : "waiting", payoutId: payout.id,
      note: `${payout.reference ? `Bank reference ${payout.reference}. ` : ""}Part of a payout of ${money(payout.amount)}.` });
  } else if (order.earningRecordedAt) {
    const from = order.payAvailableAt ? Date.parse(order.payAvailableAt) : 0;
    stops.push({ key: "bank", title: "Not paid to the chef yet", at: from > now ? order.payAvailableAt : null, state: "waiting",
      note: from > now ? "Still inside the waiting time; it can be paid from the time shown." : "Ready to be paid from Payouts." });
  }

  return refunds();
}

export function payoutStops({ payout }: PayoutTrail): Stop[] {
  const status = statusOf("CHEF_PAYOUT", payout.status), manual = payout.channel === "CRAVES_MANUAL";
  const stops: Stop[] = [{ key: "reserved", title: "Amount set aside for this chef", at: payout.createdAt, state: "done",
    note: payout.mode === "AUTOMATIC" ? "Created automatically when the earnings became due." : "Created on request." }];
  if (manual) stops.push({ key: "approved", title: payout.authorizedAt ? "Bank transfer approved" : "Bank transfer not approved yet", at: payout.authorizedAt,
    state: payout.authorizedAt ? "done" : payout.status === "RESERVED" ? "waiting" : "skipped",
    note: payout.destinationReference ? `Bank details checked against ${payout.destinationReference}.` : undefined });
  if (payout.status === "PAID") stops.push({ key: "paid", title: "Paid to the chef's bank", at: payout.paidAt, state: "done",
    note: payout.reference ? `Bank reference ${payout.reference}.` : "No bank reference was recorded." });
  else if (payout.status !== "RESERVED" || !manual) stops.push({ key: "paid", title: status.label, at: payout.updatedAt, state: status.tone === "danger" ? "problem" : status.tone === "neutral" ? "skipped" : "waiting",
    note: payout.status === "UNKNOWN" || payout.status === "REVIEW_REQUIRED" ? "Check the bank statement before doing anything else. Do not send this money again until the outcome is known."
      : payout.status === "FAILED" || payout.status === "REVERSED" ? "The money did not stay with the chef. These earnings are owed again and the chef is on hold until it is checked." : undefined });
  return stops;
}

const sentences = (...parts: (string | false | null | undefined)[]) => parts.filter((part): part is string => !!part).map(part => /[.!?]$/.test(part) ? part : `${part}.`).join(" ");
const titleCase = (value: string) => value.charAt(0) + value.slice(1).toLowerCase().replaceAll("_", " ");
