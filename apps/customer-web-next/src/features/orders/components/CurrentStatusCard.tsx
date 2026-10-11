/** The order's current status step: the heading says it, no label above it. */
export function CurrentStatusCard({ label, desc }: { label: string; desc: string }) {
  return (
    <section className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_3px_10px_rgba(0,0,0,0.05)] md:p-6">
      <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#1A1A1A]">
        {label}
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6B6B6B]">{desc}</p>
    </section>
  );
}

export default CurrentStatusCard;
