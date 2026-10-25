/** The 4-digit code the customer reads to a Craves rider at the door. Never stored or logged. */
export function DeliveryCodeCard({ code }: { code: string }) {
  return (
    <section className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_3px_10px_rgba(0,0,0,0.05)] md:p-6">
      <h2 className="text-sm font-semibold text-[#6B6B6B]">Delivery code</h2>
      <p
        role="img"
        aria-label={code.split("").join(" ")}
        className="mt-2 text-4xl font-bold tracking-[0.4em] tabular-nums text-[#1A1A1A]"
      >
        {code}
      </p>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-[#6B6B6B]">
        Tell this code to your Craves rider at the door. Craves never asks for it on a call.
      </p>
    </section>
  );
}
