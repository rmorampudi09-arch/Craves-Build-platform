import {
  CalendarCheck,
  CalendarX,
  ChefHat,
  CircleX,
  Pause,
  RefreshCw,
  Wallet,
  type LucideIcon,
} from "lucide-react";

type Step = { icon: LucideIcon; title: string; body: string; allowance?: boolean };

// The app's product rules, word for word where the web works the same way.
const BASICS: Step[] = [
  {
    icon: CalendarCheck,
    title: "Choose a plan",
    body: "Weekly (7 days), 14 days or monthly (28 days). The chef cooks one weekly menu, Sunday to Saturday, and it repeats for every week of your bill.",
  },
  {
    icon: Wallet,
    title: "Pay once per bill",
    body: "You pay for the whole bill before it starts. My plans shows the date your next bill renews.",
  },
  {
    icon: ChefHat,
    title: "When the chef gets your order",
    body: "Lunch, snack and dinner orders reach the chef at 7:00 am on the meal day. Breakfast orders reach the chef at 8:00 pm the night before. The chef accepts each meal at least 1 hour before it is due.",
  },
  {
    icon: RefreshCw,
    title: "If the chef can’t cook",
    body: "If the chef declines a meal, or doesn’t accept it in time, that day is added to the end of your plan and you get a notification. You never pay for a day that wasn’t cooked.",
  },
];
const CONTROLS: Step[] = [
  {
    icon: Pause,
    title: "Pause",
    body: "Pause any time. Meals already sent to the chef are still delivered. Your paused days are added to the end of your plan.",
    allowance: true,
  },
  {
    icon: CalendarX,
    title: "Skip a meal",
    body: "Skip any single meal up to 24 hours before it. A skipped meal is not added back to your plan, so pause instead if you’ll be away for a full day.",
  },
  {
    icon: CircleX,
    title: "Cancel",
    body: "Cancel any time. Upcoming meals stop right away; a meal the chef is already preparing is still delivered.",
  },
];
const PAUSE_DAYS = [
  { days: "1", label: "day per weekly bill" },
  { days: "3", label: "days per 14-day bill" },
  { days: "7", label: "days per monthly bill" },
];

function StepList({ steps }: { steps: Step[] }) {
  return (
    <ul className="divide-y divide-[#E5E7EB] rounded-2xl border border-[#E5E7EB] bg-white">
      {steps.map(({ icon: Icon, title, body, allowance }) => (
        <li key={title} className="flex gap-4 p-4 sm:p-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5]">
            <Icon className="h-5 w-5 text-[#F62E18]" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1 space-y-2">
            <h3 className="text-base font-bold text-[#1A1A1A]">{title}</h3>
            <p className="text-sm leading-6 text-[#6B6B6B]">{body}</p>
            {allowance ? (
              <>
                <ul className="grid grid-cols-3 gap-2">
                  {PAUSE_DAYS.map((item) => (
                    <li key={item.days} className="rounded-xl bg-[#F1F3F5] p-2.5 text-center">
                      <span className="block text-2xl font-bold text-[#C4200F]">{item.days}</span>
                      <span className="block text-xs text-[#6B6B6B]">{item.label}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-sm leading-6 text-[#6B6B6B]">
                  When your pause days run out, your plan restarts by itself. To restart sooner, tap
                  Resume at least 24 hours before the next meal.
                </p>
              </>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function MealPlanHowItWorks() {
  return (
    <div className="max-w-2xl space-y-5">
      <p className="text-sm leading-6 text-[#6B6B6B]">
        Homemade meals from one chef, on the days you pick, paid once per bill.
      </p>
      <h2 className="sr-only">The basics</h2>
      <StepList steps={BASICS} />
      <h2 className="pt-2 text-lg font-bold text-[#1A1A1A]">Your controls</h2>
      <StepList steps={CONTROLS} />
      <section className="rounded-2xl bg-[#F1F3F5] p-4 sm:p-5">
        <h2 className="text-base font-bold text-[#1A1A1A]">Delivery</h2>
        <p className="mt-1 text-sm leading-6 text-[#6B6B6B]">
          Meals come to your saved address. You can choose from chefs within 10 km of it. Each
          plan’s page lists its own meal times and rules.
        </p>
      </section>
    </div>
  );
}
