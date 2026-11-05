import { cardClass, DeletionNote, labelClass } from "@/features/account-deletion/components/deletion-page";
import { deletionCopy } from "@/features/account-deletion/domain/deletion-copy";
import type { SummaryKind } from "@/features/account-deletion/domain/deletion-model";

const customer = deletionCopy.customerSummary;
const chef = deletionCopy.chefSummary;

function Bullets({ items }: { items: readonly string[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-[#6B6B6B]">
      {items.map((item) => <li key={item}>{item}</li>)}
    </ul>
  );
}

function Kept({ label, title, body }: { label: string; title: string; body: string }) {
  return (
    <section className={cardClass}>
      <h2 className={labelClass}>{label}</h2>
      <p className="text-base font-semibold">{title}</p>
      <p className="text-sm leading-6 text-[#6B6B6B]">{body}</p>
    </section>
  );
}

function ChefSummary({ all, customerSideStays }: { all: boolean; customerSideStays: boolean }) {
  const steps = [...chef.steps, { title: all ? chef.lastStepAll : chef.lastStepSide, body: "" }];
  return (
    <>
      <section className={cardClass}>
        <h2 className={labelClass}>{chef.howLabel}</h2>
        <ol className="space-y-3">
          {steps.map((step, index) => (
            <li key={step.title} className="flex items-start gap-3">
              <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] text-xs font-bold text-[#C4200F]">{index + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-base font-semibold">{step.title}</span>
                {step.body ? <span className="block text-sm leading-6 text-[#6B6B6B]">{step.body}</span> : null}
              </span>
            </li>
          ))}
        </ol>
      </section>
      <section className={cardClass}>
        <h2 className={labelClass}>{chef.goesLabel}</h2>
        <Bullets items={all ? [...chef.goes, ...customer.goesAll] : chef.goes} />
      </section>
      <Kept label={chef.keptLabel} title={chef.keptTitle} body={chef.keptBody} />
      {all ? (
        <Kept label={customer.keptLabel} title={customer.keptTitle} body={customer.keptBody} />
      ) : customerSideStays ? (
        <DeletionNote tone="success" text={chef.customerSideStays} />
      ) : null}
    </>
  );
}

function CustomerSummary({ all, shortDate, longDate, chefSideStays }: { all: boolean; shortDate: string; longDate: string; chefSideStays: boolean }) {
  return (
    <>
      <section className={cardClass}>
        <h2 className="text-base font-semibold">{customer.dateTitle(longDate)}</h2>
        <p className="text-sm leading-6 text-[#6B6B6B]">{customer.dateBody}</p>
      </section>
      <section className={cardClass}>
        <h2 className={labelClass}>{customer.goesLabel}</h2>
        <Bullets items={all ? customer.goesAll : customer.goesSide} />
      </section>
      <Kept label={customer.keptLabel} title={customer.keptTitle} body={customer.keptBody} />
      <section className={cardClass}>
        <h2 className={labelClass}>{customer.untilLabel(shortDate)}</h2>
        <Bullets items={customer.until} />
      </section>
      {all ? (
        <p className="text-sm leading-6 text-[#6B6B6B]">{customer.signUpAgain(shortDate)}</p>
      ) : chefSideStays ? (
        <DeletionNote tone="success" text={customer.chefSideStays} />
      ) : null}
    </>
  );
}

/** What goes and what Craves keeps, in the app's four forms. The dates are today + 30 days ("5 Dec", "5 Dec 2026"). */
export function DeletionSummary({ kind, shortDate, longDate, chefSideStays, customerSideStays }: {
  kind: SummaryKind;
  shortDate: string;
  longDate: string;
  /** Customer side only: the person also has a chef side, which stays. */
  chefSideStays: boolean;
  /** Chef side only: the person also has a customer side, which stays. */
  customerSideStays: boolean;
}) {
  return kind === "chefSide" || kind === "chefAll" ? (
    <ChefSummary all={kind === "chefAll"} customerSideStays={customerSideStays} />
  ) : (
    <CustomerSummary all={kind === "customerAll"} shortDate={shortDate} longDate={longDate} chefSideStays={chefSideStays} />
  );
}
