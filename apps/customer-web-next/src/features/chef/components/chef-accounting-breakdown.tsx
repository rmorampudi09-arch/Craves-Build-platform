import { formatInr } from "@/components/chef-ui";
import type { ChefAccounting } from "@/features/admin/finance/lib/finance-contract";

export function ChefAccountingBreakdown({accounting}: {accounting: ChefAccounting | undefined}) {
  if (!accounting) return <p role="status" className="text-[0.875rem] text-[#6B6B6B]">The breakdown couldn’t load. Refresh your balance before checking a payment.</p>;
  const rows: [string, string][] = [
    ["Food earnings before deductions", accounting.grossFood],
    ["Craves service fee (incl. GST on the fee)", accounting.totalServiceFee],
    ["Tax withheld", accounting.withholding],
    ["Net earnings", accounting.originalNetEarnings],
    ["Other adjustments", accounting.otherLedgerMovements],
    ["Payments made to you (after bank returns)", accounting.recordedPayments],
    ["Outstanding balance", accounting.outstanding],
  ];
  return <div className="grid gap-3">
    <p className="text-[0.875rem] leading-6 text-[#6B6B6B]">Covers all {accounting.recordedOrders} paid and delivered orders recorded so far.</p>
    <dl className="divide-y divide-[#E3E6EA] text-[0.875rem]">{rows.map(([label, amount]) => <div key={label} className="flex flex-wrap justify-between gap-2 py-2.5"><dt className="text-[#1A1A1A]">{label}</dt><dd className="chef-amount font-semibold">{formatInr(amount)}</dd></div>)}</dl>
    <p className="text-[0.8125rem] leading-5 text-[#6B6B6B]">The service fee total includes {formatInr(accounting.feeBeforeGst)} fee and {formatInr(accounting.feeGst)} GST on the fee, not an extra deduction. GST on customers’ food is separate. Part of the outstanding balance may be held or reserved, so it isn’t always available to withdraw.</p>
    {accounting.legacyRecords > 0 && <p className="text-[0.8125rem] leading-5 text-[#6B6B6B]">{accounting.legacyRecords} older earnings entered by hand are kept separately and aren’t added to your withdrawable balance automatically.</p>}
  </div>;
}
