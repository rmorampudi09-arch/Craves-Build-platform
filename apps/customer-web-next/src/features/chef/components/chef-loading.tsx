"use client";

import { useEffect, useState, type ReactNode } from "react";

import { ChefSkeleton } from "@/features/chef/components/chef-ui";

/** Each Chef Mode page loads in its own shape, so the page fills in without jumping. */
export type ChefLoadingShape =
  | "dashboard"
  | "orders"
  | "order"
  | "menu"
  | "earnings"
  | "money"
  | "bank"
  | "statements"
  | "checklist"
  | "kitchen"
  | "plans"
  | "soon"
  | "form"
  | "notifications"
  | "more"
  | "chat";

const ROUTE_SHAPES: ReadonlyArray<readonly [RegExp, ChefLoadingShape]> = [
  [/^\/chef\/?$/, "dashboard"],
  [/^\/chef\/orders\/?$/, "orders"],
  [/^\/chef\/orders\/[^/]+\/?$/, "order"],
  [/^\/chef\/menu\/?$/, "menu"],
  [/^\/chef\/earnings\/?$/, "earnings"],
  [/^\/chef\/finance\/?$/, "money"],
  [/^\/chef\/bank\/?$/, "bank"],
  [/^\/chef\/statements\/?$/, "statements"],
  [/^\/chef\/operations\/?$/, "checklist"],
  [/^\/chef\/kitchen\/?$/, "kitchen"],
  // Meal plans are a "coming soon" page for now: a Back link and one card.
  [/^\/chef\/meal-plans\/?$/, "soon"],
  [/^\/chef\/notifications\/?$/, "notifications"],
  [/^\/chef\/profile\/?$/, "more"],
  [/^\/chef\/support\/chat\/?$/, "chat"],
];

export function chefLoadingShapeFor(pathname: string | null): ChefLoadingShape {
  return ROUTE_SHAPES.find(([pattern]) => pattern.test(pathname ?? ""))?.[1] ?? "form";
}

/** Pages whose header has a Back link above the title, a button beside it, or no line under it. */
const HEAD_BACK = new Set<ChefLoadingShape>(["order", "money", "bank", "statements", "checklist", "kitchen", "soon", "form", "notifications", "chat"]);
const HEAD_ACTION = new Set<ChefLoadingShape>(["orders", "order", "menu", "earnings"]);
const HEAD_TITLE_ONLY = new Set<ChefLoadingShape>(["bank", "checklist", "soon", "notifications"]);

const bar = (className: string) => <ChefSkeleton className={className} />;

function Head({ shape }: { shape: ChefLoadingShape }) {
  return (
    <div className="chef-page-head">
      <div className="grid min-w-0 flex-1 gap-2">
        {HEAD_BACK.has(shape) ? bar("h-11 w-24 !rounded-[14px]") : null}
        {bar("h-7 w-44 !rounded-lg")}
        {HEAD_TITLE_ONLY.has(shape) ? null : bar("h-4 w-64 max-w-full !rounded-md")}
      </div>
      {HEAD_ACTION.has(shape) ? bar("h-11 w-28 !rounded-xl") : null}
    </div>
  );
}

/** One list row: a picture or icon, two lines of words, and what sits at the end. */
export function ChefSkeletonRow({
  media = "icon",
  trailing,
}: {
  media?: "icon" | "photo" | "check" | "none";
  trailing?: "toggle" | "chevron" | "value" | "pill";
}) {
  return (
    <div className="chef-row">
      {media === "none"
        ? null
        : bar(
            media === "photo"
              ? "h-16 w-16 shrink-0 !rounded-xl"
              : media === "check"
                ? "h-7 w-7 shrink-0 !rounded-full"
                : "h-10 w-10 shrink-0 !rounded-xl",
          )}
      <div className="grid flex-1 gap-2">
        {bar("h-4 w-2/3 !rounded-md")}
        {bar("h-3 w-1/3 !rounded-md")}
      </div>
      {trailing === "toggle"
        ? bar("h-8 w-14 shrink-0 !rounded-full")
        : trailing === "value"
          ? bar("h-4 w-16 shrink-0 !rounded-md")
          : trailing === "pill"
            ? bar("h-6 w-16 shrink-0 !rounded-full")
            : trailing === "chevron"
              ? bar("h-4 w-4 shrink-0 !rounded-sm")
              : null}
    </div>
  );
}
const Row = ChefSkeletonRow;

/** Menu while dishes load: a category heading, then photo, name, price, status and the on/off switch. */
export function ChefMenuSkeleton() {
  return (
    <div className="grid gap-2" aria-hidden="true">
      {bar("mx-1 h-5 w-28 !rounded-md")}
      <ul className="chef-section chef-list">
        {[0, 1, 2, 3].map((key) => (
          <li key={key} className="flex items-center gap-1 pr-3 md:pr-4">
            <div className="chef-row min-w-0 flex-1">
              {bar("h-[4.5rem] w-[4.5rem] shrink-0 !rounded-[14px]")}
              <div className="grid flex-1 gap-2">
                {bar("h-4 w-2/3 !rounded-md")}
                {bar("h-3 w-1/3 !rounded-md")}
                {bar("h-5 w-20 !rounded-full")}
              </div>
            </div>
            {bar("h-[1.875rem] w-[3.875rem] shrink-0 !rounded-full")}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The balance card's body while the balance loads: the amount, two figures and the payout button. */
export function ChefBalanceSkeleton() {
  return (
    <div className="grid gap-4" aria-hidden="true">
      {bar("h-9 w-44 !rounded-lg")}
      <div className="grid grid-cols-2 gap-3">
        {[0, 1].map((key) => (
          <div key={key} className="grid gap-1.5">
            {bar("h-3.5 w-24 max-w-full !rounded-md")}
            {bar("h-4 w-20 !rounded-md")}
          </div>
        ))}
      </div>
      {bar("mt-1 h-12 w-full !rounded-xl")}
      {bar("h-3.5 w-4/5 !rounded-md")}
    </div>
  );
}

/** The bank card while the account loads: which account money goes to, and the change link. */
export function ChefBankSkeleton() {
  return (
    <div className="grid gap-4" aria-hidden="true">
      <div className="flex items-start gap-3 rounded-xl border border-[#E3E6EA] p-4">
        {bar("h-10 w-10 shrink-0 !rounded-xl")}
        <div className="grid flex-1 gap-2">
          {bar("h-4 w-40 max-w-full !rounded-md")}
          {bar("h-3.5 w-3/4 !rounded-md")}
        </div>
      </div>
      {bar("h-5 w-44 !rounded-md")}
    </div>
  );
}

function List({ rows, title = false, ...row }: { rows: number; title?: boolean } & Parameters<typeof Row>[0]) {
  return (
    <div className="chef-section">
      {title ? <div className="chef-section-head">{bar("h-5 w-44 !rounded-md")}</div> : null}
      <div className={`chef-list${title ? " mt-3" : ""}`}>
        {Array.from({ length: rows }, (_, index) => (
          <Row key={index} {...row} />
        ))}
      </div>
    </div>
  );
}

function Chips({ count, className = "h-11 w-20", wrap = false }: { count: number; className?: string; wrap?: boolean }) {
  return (
    <div className={`flex gap-2 ${wrap ? "flex-wrap" : "overflow-hidden"}`}>
      {Array.from({ length: count }, (_, index) => (
        <ChefSkeleton key={index} className={`${className} shrink-0 !rounded-full`} />
      ))}
    </div>
  );
}

/** Order card: status pill and total, order number, two dish lines, Accept and Can't take it. */
function OrderCard() {
  return (
    <div className="chef-section chef-section-body grid gap-3">
      <div className="flex items-center justify-between gap-3">
        {bar("h-6 w-24 !rounded-full")}
        {bar("h-5 w-16 !rounded-md")}
      </div>
      {bar("h-4 w-1/3 !rounded-md")}
      {[0, 1].map((line) => (
        <div key={line} className="flex items-center gap-3">
          {bar("h-9 w-9 shrink-0 !rounded-lg")}
          {bar("h-4 flex-1 !rounded-md")}
        </div>
      ))}
      {bar("mt-1 h-12 w-full !rounded-xl")}
      {bar("h-12 w-full !rounded-xl")}
    </div>
  );
}

function Stats({ count, children }: { count: 3 | 4; children?: ReactNode }) {
  return (
    <div className="chef-section">
      <div className={`chef-stats ${count === 4 ? "is-four" : "is-three"}`}>
        {Array.from({ length: count }, (_, index) => (
          <div key={index} className="chef-stat grid gap-2">
            {bar("h-3 w-20 !rounded-md")}
            {bar("h-6 w-24 !rounded-md")}
          </div>
        ))}
      </div>
      {children}
    </div>
  );
}

function FormCard() {
  return (
    <div className="chef-section chef-section-body grid gap-3">
      {bar("h-6 w-48 !rounded-md")}
      {bar("h-3.5 w-full !rounded-md")}
      {bar("h-3.5 w-3/4 !rounded-md")}
      {[0, 1, 2].map((field) => (
        <div key={field} className="mt-2 grid gap-2">
          {bar("h-3.5 w-32 !rounded-md")}
          {bar("h-12 w-full !rounded-xl")}
        </div>
      ))}
      {bar("mt-2 h-12 w-40 !rounded-xl")}
    </div>
  );
}

const BODIES: Record<ChefLoadingShape, () => React.ReactNode> = {
  dashboard: () => (
    <>
      <div className="chef-section">
        <Row trailing="toggle" />
      </div>
      {bar("h-5 w-48 !rounded-md")}
      <OrderCard />
    </>
  ),
  orders: () => (
    <>
      <Chips count={4} />
      <OrderCard />
      <OrderCard />
    </>
  ),
  order: () => (
    <>
      <div className="chef-section chef-section-body flex justify-between gap-2">
        {Array.from({ length: 5 }, (_, step) => (
          <div key={step} className="grid justify-items-center gap-2">
            {bar("h-9 w-9 !rounded-full")}
            {bar("h-3 w-12 !rounded-md")}
          </div>
        ))}
      </div>
      <List rows={3} title media="icon" trailing="value" />
      <OrderCard />
    </>
  ),
  menu: () => <ChefMenuSkeleton />,
  // Totals and their note, the Statements and Bank account rows, then each order's money.
  earnings: () => (
    <>
      <Stats count={3}>
        <div className="border-t border-[#E3E6EA] px-4 py-3 md:px-5">{bar("h-3.5 w-4/5 !rounded-md")}</div>
      </Stats>
      <List rows={2} trailing="chevron" />
      <div className="chef-section">
        <div className="chef-section-head">
          {bar("h-5 w-44 !rounded-md")}
          {bar("h-11 w-28 !rounded-xl")}
        </div>
        <div className="mt-3 px-4 md:px-5">
          <Chips count={4} className="h-10 w-24" />
        </div>
        <div className="chef-list mt-3">
          {[0, 1, 2].map((row) => (
            <Row key={row} media="none" trailing="value" />
          ))}
        </div>
      </div>
    </>
  ),
  // The balance card, the payouts heading, then the bank card.
  money: () => (
    <>
      <div className="chef-section chef-section-body grid gap-4">
        {bar("h-5 w-48 !rounded-md")}
        <ChefBalanceSkeleton />
      </div>
      <div className="chef-section chef-section-body grid gap-2">
        {bar("h-5 w-44 !rounded-md")}
        {bar("h-3.5 w-3/4 !rounded-md")}
      </div>
      <div className="chef-section chef-section-body grid gap-4">
        <div className="grid gap-2">
          {bar("h-5 w-32 !rounded-md")}
          {bar("h-3.5 w-3/4 !rounded-md")}
        </div>
        <ChefBankSkeleton />
      </div>
    </>
  ),
  bank: () => (
    <div className="chef-section chef-section-body grid gap-4">
      {bar("h-3.5 w-3/4 !rounded-md")}
      <ChefBankSkeleton />
    </div>
  ),
  // What the PDF shows, which days (chips), the button, then the PDFs already made.
  statements: () => (
    <>
      <div className="chef-section chef-section-body grid gap-5">
        <div className="grid gap-2">
          {bar("h-5 w-32 !rounded-md")}
          {bar("h-3.5 w-4/5 !rounded-md")}
        </div>
        <div className="grid gap-2">
          {bar("h-4 w-40 !rounded-md")}
          <Chips count={3} className="h-11 w-24" wrap />
        </div>
        <div className="grid gap-2">
          {bar("h-4 w-24 !rounded-md")}
          <Chips count={5} className="h-11 w-28" wrap />
        </div>
        {bar("h-12 w-full !rounded-xl sm:w-36")}
      </div>
      <List rows={3} title media="none" trailing="pill" />
    </>
  ),
  checklist: () => (
    <>
      <div className="chef-section">
        <Row media="check" />
      </div>
      <div className="chef-section">
        <Row trailing="toggle" />
      </div>
      <List rows={3} title media="check" />
    </>
  ),
  kitchen: () => (
    <div className="chef-section chef-section-body grid gap-3">
      <div className="flex items-center gap-3">
        {bar("h-7 w-56 max-w-[70%] !rounded-lg")}
        {bar("h-6 w-16 !rounded-full")}
      </div>
      {bar("h-3.5 w-full !rounded-md")}
      {bar("h-3.5 w-5/6 !rounded-md")}
      {bar("h-3.5 w-2/3 !rounded-md")}
      <div className="mt-2 flex gap-3">
        {bar("h-5 w-5 shrink-0 !rounded-full")}
        <div className="grid flex-1 gap-2">
          {bar("h-3.5 w-28 !rounded-md")}
          {bar("h-3.5 w-full !rounded-md")}
          {bar("h-3.5 w-3/4 !rounded-md")}
        </div>
      </div>
      {bar("mt-2 h-12 w-full !rounded-xl")}
      {bar("h-12 w-full !rounded-xl")}
    </div>
  ),
  plans: () => (
    <>
      <Stats count={4} />
      <div className="grid gap-2 px-1">
        {bar("h-4 w-3/4 !rounded-md")}
        {bar("h-3.5 w-1/2 !rounded-md")}
      </div>
      <List rows={2} title trailing="chevron" />
    </>
  ),
  soon: () => (
    <div className="chef-section grid justify-items-center gap-3 px-5 py-10">
      {bar("h-12 w-12 !rounded-[14px]")}
      {bar("mt-2 h-5 w-56 max-w-full !rounded-md")}
      {bar("h-3.5 w-72 max-w-full !rounded-md")}
      {bar("h-3.5 w-60 max-w-full !rounded-md")}
      {bar("mt-3 h-14 w-full !rounded-xl sm:w-48")}
    </div>
  ),
  form: () => <FormCard />,
  notifications: () => (
    <>
      <Chips count={3} className="h-9 w-28" />
      <Chips count={3} className="h-5 w-16" />
      {bar("h-4 w-16 !rounded-md")}
      {[0, 1].map((card) => (
        <div key={card} className="chef-section chef-section-body flex gap-3">
          {bar("h-10 w-10 shrink-0 !rounded-xl")}
          <div className="grid flex-1 gap-2">
            {bar("h-4 w-2/3 !rounded-md")}
            {bar("h-3.5 w-full !rounded-md")}
            {bar("h-3.5 w-4/5 !rounded-md")}
            {bar("mt-1 h-10 w-32 !rounded-full")}
          </div>
        </div>
      ))}
    </>
  ),
  more: () => (
    <>
      <div className="chef-section flex items-center gap-4 p-4">
        {bar("h-14 w-14 shrink-0 !rounded-full")}
        <div className="grid flex-1 gap-2">
          {bar("h-5 w-1/2 !rounded-md")}
          {bar("h-4 w-1/3 !rounded-md")}
        </div>
      </div>
      {bar("h-3.5 w-16 !rounded-md")}
      <List rows={4} trailing="chevron" />
    </>
  ),
  chat: () => (
    <div className="grid gap-3 py-4">
      {bar("h-14 w-3/4 !rounded-2xl")}
      {bar("ml-auto h-10 w-1/2 !rounded-2xl")}
      {bar("h-20 w-2/3 !rounded-2xl")}
      {bar("mt-4 h-12 w-full !rounded-xl")}
    </div>
  ),
};

/**
 * Placeholder for a Chef Mode page while it loads. Quick loads show nothing (the blocks fade in
 * after 300 ms); after 10 s it says what to check. `head` adds the page title row for screens
 * whose title only appears once their data is in.
 */
export function ChefLoading({
  shape,
  label,
  head = true,
}: {
  shape: ChefLoadingShape;
  label: string;
  head?: boolean;
}) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 10_000);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div aria-busy="true">
      <p
        role="status"
        className={
          slow
            ? "mx-auto mb-4 w-fit rounded-full border border-[#E3E6EA] bg-white px-4 py-2 text-center text-sm font-semibold text-[#1A1A1A]"
            : "sr-only"
        }
      >
        {slow ? "Still loading. Check your internet connection." : label}
      </p>
      {head ? <Head shape={shape} /> : null}
      <div className="chef-stack" aria-hidden="true">
        {BODIES[shape]()}
      </div>
    </div>
  );
}
