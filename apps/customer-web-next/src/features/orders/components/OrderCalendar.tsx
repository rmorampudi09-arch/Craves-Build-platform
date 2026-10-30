import { Fragment } from "react";
import type { CustomerOrder } from "@/features/orders/lib/order-contract";
import type { DeliveryStatusResponse } from "@/features/orders/lib/delivery-status";
import { orderCalendar, type CalendarRow } from "@/features/orders/lib/order-calendar";

const clock = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" });
const dayName = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long" });
// Khand, the Kitchen Calendar's condensed face; the page sets --font-calendar.
const CONDENSED = "font-[family-name:var(--font-calendar)] font-semibold";
const ROW = "grid grid-cols-[3.75rem_1.5rem_minmax(0,1fr)] gap-x-2";

function money(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
}

/** The step's dot; its ring is the row's own paper, so the rail stops short of it. */
function Dot({ state, shaded = false }: { state: CalendarRow["state"]; shaded?: boolean }) {
  const ring = shaded ? "ring-4 ring-[#FFF6D6]" : "ring-4 ring-white";
  if (state === "now") return <span className={`relative block h-3.5 w-3.5 rounded-full bg-[#F62E18] ${ring}`} />;
  if (state === "done") return <span className={`relative block h-2.5 w-2.5 rounded-full bg-[#151515] ${ring}`} />;
  return <span className={`relative block h-2.5 w-2.5 rounded-full border-2 border-[#151515] bg-white ${ring}`} />;
}

/** The planner line through the dots: solid up to now, dotted for what is still to come. */
function Rail({ upcoming, first, last }: { upcoming: boolean; first?: boolean; last?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={[
        "absolute left-1/2 -translate-x-1/2",
        first ? "top-4" : "top-0",
        last ? "h-4" : "bottom-0",
        upcoming ? "border-l-2 border-dotted border-[#151515]" : "w-0.5 bg-[#151515]",
      ].join(" ")}
    />
  );
}

/**
 * The live order on the Kitchen Calendar's day sheet: the step, its real time in the margin, a red line at now, and
 * what is still to come below it, the delivery's row shaded. No big arrival time: Craves doesn't have one to promise.
 */
export function OrderCalendar({
  order,
  delivery,
  now,
  title,
}: {
  order: CustomerOrder;
  delivery: DeliveryStatusResponse | null;
  now: Date;
  title: string;
}) {
  const sheet = orderCalendar(order, delivery);
  if (!sheet) return null;
  const items = order.items.reduce((count, item) => count + item.quantity, 0);
  return (
    <section aria-labelledby="order-now" className="space-y-4">
      <div>
        <h2 id="order-now" className={`${CONDENSED} text-[2rem] leading-none text-[#151515]`}>
          {title}
        </h2>
        <p className="mt-2 text-[0.9375rem] leading-6 text-[#59645C]">
          {items} {items === 1 ? "item" : "items"} from {order.kitchenName}, paid {money(order.grandTotal, order.currency)}
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border-2 border-[#151515] bg-white px-4 pt-4">
        <p className={`${CONDENSED} text-[1.375rem] leading-none text-[#151515]`}>{dayName.format(new Date(order.createdAt))}</p>
        <div aria-hidden="true" className="mt-2 h-[5px] border-y-2 border-[#151515]" />
        <ol className="mt-1" aria-label="Order steps">
          {sheet.rows.map((row, index) => {
            const last = index === sheet.rows.length - 1;
            const nextUpcoming = !last && sheet.rows[index + 1].state === "next";
            return (
              <Fragment key={row.step}>
                <li
                  aria-current={row.state === "now" ? "step" : undefined}
                  className={`${ROW} ${row.step === "delivered" ? "-mx-4 bg-[#FFF6D6] px-4 pb-1" : ""}`}
                >
                  <span className={`${CONDENSED} pt-2.5 text-right text-[0.9375rem] tabular-nums text-[#3F3F3F]`}>
                    {row.at ? <time dateTime={row.at}>{clock.format(new Date(row.at))}</time> : null}
                  </span>
                  <span className="relative flex justify-center pt-3.5">
                    <Rail upcoming={row.state === "next" || (nextUpcoming && sheet.nowAfter !== index)} first={index === 0} last={last} />
                    <Dot state={row.state} shaded={row.step === "delivered"} />
                  </span>
                  <div className="min-w-0 py-2">
                    <p
                      className={
                        row.state === "now"
                          ? `${CONDENSED} text-[1.375rem] leading-tight text-[#151515]`
                          : `text-[0.9375rem] font-semibold ${row.state === "next" ? "text-[#59645C]" : "text-[#151515]"}`
                      }
                    >
                      {row.label}
                    </p>
                    <p className="text-sm text-[#59645C]">{row.detail}</p>
                  </div>
                </li>
                {sheet.nowAfter === index ? (
                  <li aria-hidden="true" className={`${ROW} items-center`}>
                    <span className={`${CONDENSED} text-right text-[0.9375rem] tabular-nums text-[#C8281F]`}>{clock.format(now)}</span>
                    <span className="relative flex h-6 items-center justify-center">
                      <Rail upcoming />
                      <span className="relative block h-2.5 w-2.5 rounded-full bg-[#F62E18]" />
                    </span>
                    <span className="h-0.5 bg-[#F62E18]" />
                  </li>
                ) : null}
              </Fragment>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

export default OrderCalendar;
