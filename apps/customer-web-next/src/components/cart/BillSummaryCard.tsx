import { PriceRow } from "@/components/order/PriceRow";

interface BillSummaryCardProps {
  subtotal: number;
  currency?: string;
}

/** "Bill details" card: item total, delivery fee, taxes, grand total, free-delivery nudge. */
export function BillSummaryCard({
  subtotal,
  currency = "INR",
}: BillSummaryCardProps) {
  const amount = new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(subtotal);
  return (
    <section className="mt-6 rounded-2xl border border-border bg-card p-5">
      <h3 className="font-display text-lg font-bold text-ink">Bill details</h3>
      <dl className="mt-3 space-y-2 text-sm">
        <PriceRow label="Food subtotal" value={amount} bold />
      </dl>
      <p className="mt-3 rounded-lg bg-primary/10 px-3 py-2 text-xs text-primary">Delivery fee, platform fee and taxes are calculated by Order Service after you select a saved delivery address.</p>
    </section>
  );
}

export default BillSummaryCard;
