import type { CustomerOrder } from "@/lib/order-contract";

function money(amount: number, currency: string, minimumFractionDigits = 2) {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      minimumFractionDigits,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(minimumFractionDigits)}`;
  }
}

export function TrackingOrderSummaryCard({ order }: { order: CustomerOrder }) {
  return (
    <section className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_3px_10px_rgba(0,0,0,0.05)]">
      <h3 className="text-lg font-semibold text-[#1A1A1A]">Order summary</h3>
      <p className="mt-1 text-sm font-medium text-[#1A1A1A]">{order.kitchenName}</p>

      <ul className="mt-4 divide-y divide-[#E5E7EB] text-sm">
        {order.items.map((item) => (
          <li key={item.id} className="flex items-start justify-between gap-3 py-3">
            <span className="min-w-0 text-[#1A1A1A]">
              {item.itemName} <span className="text-[#6B6B6B]">× {item.quantity}</span>
            </span>
            <span className="shrink-0 font-semibold text-[#1A1A1A]">
              {money(item.lineTotal, order.currency, 0)}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-4 space-y-3 rounded-xl bg-[#F1F3F5] p-4 text-sm text-[#6B6B6B]">
        <p className="flex justify-between gap-4">
          <span>Food subtotal</span>
          <span>{money(order.foodSubtotal, order.currency)}</span>
        </p>
        <p className="flex justify-between gap-4">
          <span>Platform fee</span>
          <span>{money(order.platformFee, order.currency)}</span>
        </p>
        <p className="flex justify-between gap-4">
          <span>Tax</span>
          <span>{money(order.taxAmount, order.currency)}</span>
        </p>
        <p className="flex justify-between gap-4">
          <span>Delivery</span>
          <span>{money(order.deliveryFee, order.currency)}</span>
        </p>
        <p className="flex justify-between gap-4 border-t border-[#E5E7EB] pt-4 text-base font-semibold text-[#1A1A1A]">
          <span>Backend total</span>
          <span>{money(order.grandTotal, order.currency)}</span>
        </p>
      </div>
    </section>
  );
}

export default TrackingOrderSummaryCard;
