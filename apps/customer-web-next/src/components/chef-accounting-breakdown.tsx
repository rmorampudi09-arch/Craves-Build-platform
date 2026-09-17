import type { ChefAccounting } from "@/lib/finance-contract";

export function ChefAccountingBreakdown({accounting}: {accounting: ChefAccounting | undefined}) {
  if (!accounting) return <p role="status" className="text-sm text-slate-600">The earnings breakdown is unavailable. Refresh before reconciling a payment.</p>;
  const rows = [
    ["Food earnings before deductions", accounting.grossFood],
    ["Total Craves service fee (including fee GST)", accounting.totalServiceFee],
    ["Withholding recorded", accounting.withholding],
    ["Original net earnings", accounting.originalNetEarnings],
    ["Other posted adjustments", accounting.otherLedgerMovements],
    ["Confirmed payments, after bank reversals", accounting.recordedPayments],
    ["Recorded outstanding balance", accounting.outstanding],
  ];
  return <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
    <h3 className="font-semibold">Earnings breakdown</h3>
    <p className="text-sm text-slate-600">{accounting.recordedOrders} paid and delivered orders recorded by the new accounting system. These totals cover all recorded history, not only the latest page.</p>
    <dl className="divide-y divide-slate-100">{rows.map(([label, amount]) => <div key={label} className="flex flex-wrap justify-between gap-2 py-2 text-sm"><dt>{label}</dt><dd className="font-semibold tabular-nums">₹{amount}</dd></div>)}</dl>
    <p className="text-xs text-slate-600">Within the total fee: ₹{accounting.feeBeforeGst} service fee and ₹{accounting.feeGst} fee GST—not an extra deduction. Customer food GST is separate. Outstanding money may be held or reserved and is not necessarily available to withdraw.</p>
    {accounting.legacyRecords > 0 && <p className="text-sm text-slate-600">{accounting.legacyRecords} older manually entered earnings records are kept separately. They are not automatically added to the new withdrawable balance.</p>}
  </section>;
}
