import { FaCheck } from "react-icons/fa6";

export interface TrackingStep {
  key: string;
  label: string;
  desc: string;
}

interface OrderTimelineProps {
  steps: TrackingStep[];
  currentIndex: number;
}

/** Vertical connected timeline using only backend-provided order and delivery steps. */
export function OrderTimeline({ steps, currentIndex }: OrderTimelineProps) {
  return (
    <section className="rounded-xl border border-[#E5E7EB] bg-white p-4 sm:p-5">
      <ol className="relative space-y-6 pl-9">
        <span
          className="absolute left-[15px] top-3 h-[calc(100%-24px)] w-px bg-[#E5E7EB]"
          aria-hidden="true"
        />
        {steps.map((step, index) => {
          const done = index <= currentIndex;
          const active = index === currentIndex;

          return (
            <li key={step.key} className="relative">
              <span
                className={`absolute -left-9 flex h-7 w-7 items-center justify-center rounded-full ${
                  done
                    ? "bg-[#F62E18] text-white"
                    : "bg-[#F1F3F5] text-[#6B6B6B]"
                }`}
              >
                {done ? (
                  <FaCheck className="text-xs" aria-hidden="true" />
                ) : (
                  <span className="h-2 w-2 rounded-full bg-current" aria-hidden="true" />
                )}
              </span>
              <p
                className={`text-sm font-semibold ${
                  active ? "text-[#F62E18]" : "text-[#1A1A1A]"
                }`}
              >
                {step.label}
              </p>
              <p className="mt-1 text-xs leading-5 text-[#6B6B6B]">{step.desc}</p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export default OrderTimeline;
