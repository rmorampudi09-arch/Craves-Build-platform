import { FaLocationDot, FaPhone } from "react-icons/fa6";

/** "Delivering to" card: saved address plus a rider-will-call note. */
export function DeliveryAddressCard({ address }: { address?: string }) {
  return (
    <section className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_3px_10px_rgba(0,0,0,0.05)] md:p-6">
      <h3 className="text-lg font-semibold text-[#1A1A1A]">Delivering to</h3>

      <div className="mt-4 flex items-start gap-3.5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]">
          <FaLocationDot className="text-lg" aria-hidden="true" />
        </span>
        <p className="pt-1.5 text-sm leading-6 text-[#1A1A1A]">
          {address || "Your saved address"}
        </p>
      </div>

      <div className="mt-4 flex items-center gap-3.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]">
          <FaPhone className="text-sm" aria-hidden="true" />
        </span>
        <p className="text-xs leading-5 text-[#6B6B6B]">
          Rider will call before arriving.
        </p>
      </div>
    </section>
  );
}

export default DeliveryAddressCard;
