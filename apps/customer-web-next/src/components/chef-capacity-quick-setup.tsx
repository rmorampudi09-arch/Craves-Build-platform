"use client";

export function ChefCapacityQuickSetup() {
  return (
    <section className="rounded-2xl border border-border bg-white p-5 shadow-[var(--shadow-card)] md:p-6">
      <p className="craves-overline text-primary">Quick setup</p>
      <h2 className="mt-1 font-display text-2xl font-bold text-ink">Subscription capacity setup</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        For monthly meal plans, configure the same meal slot for all seven weekdays. Use the advanced capacity controls below while Craves verifies each weekday before approval.
      </p>
    </section>
  );
}
