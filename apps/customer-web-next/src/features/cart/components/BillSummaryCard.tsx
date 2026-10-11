import { FaBagShopping, FaShieldHalved } from "react-icons/fa6";

interface BillSummaryCardProps {
  subtotal: number;
  currency?: string;
}

function money(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function BillSummaryCard({
  subtotal,
  currency = "INR",
}: BillSummaryCardProps) {
  return (
    <section className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_6px_22px_rgba(17,24,39,0.05)] md:p-6">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]">
          <FaBagShopping className="text-lg" aria-hidden="true" />
        </span>
        <div>
          <p className="craves-overline text-[#6B6B6B]">Current cart</p>
          <h2 className="font-display text-lg font-bold text-[#1A1A1A]">
            Bill preview
          </h2>
        </div>
      </div>
      <dl className="mt-5 border-y border-[#E5E7EB] py-4">
        <div className="flex items-center justify-between gap-4">
          <dt className="text-sm text-[#1A1A1A]">Food subtotal</dt>
          <dd className="font-display text-xl font-bold text-[#1A1A1A]">
            {money(subtotal, currency)}
          </dd>
        </div>
      </dl>
      <div className="mt-4 flex items-start gap-3 text-xs leading-5 text-[#1A1A1A]">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]">
          <FaShieldHalved className="text-sm" aria-hidden="true" />
        </span>
        <p className="pt-1">
          Delivery fee, platform fee, tax and final total are calculated by the Order Service after a saved delivery address is selected.
        </p>
      </div>
    </section>
  );
}

export default BillSummaryCard;
