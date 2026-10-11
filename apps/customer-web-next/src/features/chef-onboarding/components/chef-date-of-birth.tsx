"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Sheet, secondaryActionClass } from "@/shared/ui/overlays/overlay";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = [["S", "Sunday"], ["M", "Monday"], ["T", "Tuesday"], ["W", "Wednesday"], ["T", "Thursday"], ["F", "Friday"], ["S", "Saturday"]] as const;
const EASE = [0.22, 1, 0.36, 1] as const;
// The sheet renders outside the application's styles: every button names its own look.
const PLAIN = "!border-0 !shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A1A1A] focus-visible:ring-offset-1";

type View = "year" | "month" | "day";
type Day = { year: number; month: number; day: number };

function parse(value: string): Day | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? { year: Number(match[1]), month: Number(match[2]) - 1, day: Number(match[3]) } : null;
}
function iso({ year, month, day }: Day): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
const daysIn = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
const spoken = ({ year, month, day }: Day) => `${day} ${MONTHS[month]} ${year}`;

/**
 * Date of birth as a calendar made for birthdays: pick the year, then the month, then the day.
 * Keeps the yyyy-mm-dd value; days after `max` (the 18th birthday cut-off) can't be picked.
 */
export function DateOfBirthPicker({
  id,
  labelId,
  value,
  max,
  min = "1900-01-01",
  disabled,
  invalid,
  describedBy,
  onChange,
}: {
  id: string;
  labelId: string;
  value: string;
  max: string;
  min?: string;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  onChange: (value: string) => void;
}) {
  const latest = parse(max)!;
  const earliest = parse(min)!;
  const picked = parse(value);
  const reduceMotion = useReducedMotion();
  const valueId = useId();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("year");
  const [draft, setDraft] = useState<Day | null>(picked);
  const [shown, setShown] = useState({ year: picked?.year ?? latest.year - 20, month: picked?.month ?? 0 });
  const [direction, setDirection] = useState(0);
  const [focusDay, setFocusDay] = useState(picked?.day ?? 1);
  const yearList = useRef<HTMLDivElement>(null);
  const dayGrid = useRef<HTMLDivElement>(null);
  const moveFocus = useRef(false);

  const before = (a: Day, b: Day) => iso(a) < iso(b);
  const allowed = (day: Day) => !before(day, earliest) && !before(latest, day);
  const monthAllowed = (year: number, month: number) =>
    allowed({ year, month, day: 1 }) || allowed({ year, month, day: daysIn(year, month) });

  function begin() {
    const start = parse(value);
    setDraft(start);
    setShown({ year: start?.year ?? latest.year - 20, month: start?.month ?? 0 });
    setFocusDay(start?.day ?? 1);
    setDirection(0);
    setView(start ? "day" : "year");
    setOpen(true);
  }
  function showMonth(year: number, month: number) {
    setDirection(year * 12 + month > shown.year * 12 + shown.month ? 1 : -1);
    setShown({ year, month });
    setFocusDay((day) => Math.min(day, daysIn(year, month)));
  }
  function step(months: number) {
    const target = new Date(shown.year, shown.month + months, 1);
    if (monthAllowed(target.getFullYear(), target.getMonth())) showMonth(target.getFullYear(), target.getMonth());
  }

  // The year list opens on the chosen year, or on a typical one, instead of the far end.
  useEffect(() => {
    if (!open || view !== "year") return;
    const frame = requestAnimationFrame(() =>
      yearList.current?.querySelector<HTMLElement>("[data-current]")?.scrollIntoView?.({ block: "center" }),
    );
    return () => cancelAnimationFrame(frame);
  }, [open, view]);
  // Arrow keys move the focus ring between days, across months.
  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    dayGrid.current?.querySelector<HTMLElement>(`[data-day="${focusDay}"]`)?.focus();
  }, [focusDay, shown]);

  function onGridKey(event: KeyboardEvent<HTMLDivElement>) {
    const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    let target: Date | null = null;
    if (event.key in moves) target = new Date(shown.year, shown.month, focusDay + moves[event.key]!);
    else if (event.key === "PageUp" || event.key === "PageDown")
      target = new Date(shown.year, shown.month + (event.key === "PageUp" ? -1 : 1), focusDay);
    if (!target) return;
    event.preventDefault();
    const next = { year: target.getFullYear(), month: target.getMonth(), day: target.getDate() };
    if (!allowed(next)) return;
    moveFocus.current = true;
    if (next.year !== shown.year || next.month !== shown.month) showMonth(next.year, next.month);
    setFocusDay(next.day);
  }

  const years: number[] = [];
  for (let year = latest.year; year >= earliest.year; year -= 1) years.push(year);
  const lead = new Date(shown.year, shown.month, 1).getDay();
  const total = daysIn(shown.year, shown.month);
  const prevMonth = new Date(shown.year, shown.month - 1, 1);
  const nextMonth = new Date(shown.year, shown.month + 1, 1);
  const enter = reduceMotion ? false : { opacity: 0, scale: 0.98 };

  return (
    <>
      <button
        type="button"
        id={id}
        disabled={disabled}
        aria-labelledby={`${labelId} ${valueId}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-describedby={describedBy}
        data-invalid={invalid || undefined}
        onClick={begin}
        className="cob-input cob-date-trigger"
      >
        <span id={valueId} className={picked ? "" : "cob-date-placeholder"}>
          {picked ? spoken(picked) : "Choose your date of birth"}
        </span>
        <CalendarDays size={20} aria-hidden="true" />
      </button>

      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Date of birth"
        description={draft ? spoken(draft) : "Pick the year you were born, then the month and the day."}
        footer={
          <>
            <button type="button" className={secondaryActionClass} onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="craves-primary-action w-full sm:w-auto"
              disabled={!draft}
              onClick={() => {
                if (!draft) return;
                onChange(iso(draft));
                setOpen(false);
              }}
            >
              Done
            </button>
          </>
        }
      >
        <div className="mt-4 min-h-[21.5rem]">
          {view === "year" ? (
            <motion.div key="year" initial={enter} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.18, ease: EASE }}>
              <p className="mb-2 text-sm font-semibold text-[#6B6B6B]">Year</p>
              <div ref={yearList} role="group" aria-label="Year" className="grid max-h-[19rem] grid-cols-4 gap-2 overflow-y-auto overscroll-contain pr-1">
                {years.map((year) => {
                  const current = year === (draft?.year ?? shown.year);
                  // Filled only once chosen; the year being browsed (or the starting point) is outlined.
                  const tone = draft?.year === year
                    ? "!bg-[#1A1A1A] !text-white"
                    : current
                      ? "!bg-white !text-[#1A1A1A] !shadow-[inset_0_0_0_1.5px_#1A1A1A]"
                      : "!bg-[#F1F3F5] !text-[#1A1A1A] hover:!bg-[#E6E9EC]";
                  return (
                    <button
                      key={year}
                      type="button"
                      data-current={current || undefined}
                      aria-pressed={draft?.year === year}
                      onClick={() => {
                        setShown({ year, month: draft?.year === year ? draft.month : shown.month });
                        setView("month");
                      }}
                      className={`${PLAIN} min-h-11 rounded-full text-[0.9375rem] font-semibold tabular-nums transition-[background-color,color] duration-150 ${tone}`}
                    >
                      {year}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          ) : view === "month" ? (
            <motion.div key="month" initial={enter} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.18, ease: EASE }}>
              <button type="button" onClick={() => setView("year")} className={`${PLAIN} mb-3 inline-flex min-h-11 items-center gap-1 rounded-full !bg-[#F1F3F5] px-4 text-base font-bold tabular-nums !text-[#1A1A1A]`}>
                {shown.year}
                <ChevronDown size={18} aria-hidden="true" />
                <span className="sr-only">, choose another year</span>
              </button>
              <div role="group" aria-label={`Month in ${shown.year}`} className="grid grid-cols-3 gap-2">
                {MONTHS.map((name, month) => {
                  const enabled = monthAllowed(shown.year, month);
                  const current = draft?.year === shown.year && draft.month === month;
                  return (
                    <button
                      key={name}
                      type="button"
                      disabled={!enabled}
                      aria-label={`${name} ${shown.year}`}
                      aria-pressed={current}
                      onClick={() => {
                        setDirection(0);
                        setShown({ year: shown.year, month });
                        setFocusDay((day) => Math.min(day, daysIn(shown.year, month)));
                        setView("day");
                      }}
                      className={`${PLAIN} min-h-14 rounded-2xl text-[0.9375rem] font-semibold transition-[background-color,color] duration-150 disabled:!bg-transparent disabled:!text-[#B9BEC5] ${
                        current ? "!bg-[#1A1A1A] !text-white" : "!bg-[#F1F3F5] !text-[#1A1A1A] hover:!bg-[#E6E9EC]"
                      }`}
                    >
                      {name.slice(0, 3)}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          ) : (
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <button
                  type="button"
                  aria-label={`Previous month, ${MONTHS[prevMonth.getMonth()]} ${prevMonth.getFullYear()}`}
                  disabled={!monthAllowed(prevMonth.getFullYear(), prevMonth.getMonth())}
                  onClick={() => step(-1)}
                  className={`${PLAIN} grid h-11 w-11 place-items-center rounded-full !bg-transparent !text-[#1A1A1A] hover:!bg-[#F1F3F5] disabled:!text-[#B9BEC5]`}
                >
                  <ChevronLeft size={20} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => setView("year")}
                  className={`${PLAIN} inline-flex min-h-11 items-center gap-1 rounded-full !bg-transparent px-3 text-base font-bold !text-[#1A1A1A] hover:!bg-[#F1F3F5]`}
                >
                  <span aria-live="polite">{MONTHS[shown.month]} {shown.year}</span>
                  <ChevronDown size={18} aria-hidden="true" />
                  <span className="sr-only">, choose another year</span>
                </button>
                <button
                  type="button"
                  aria-label={`Next month, ${MONTHS[nextMonth.getMonth()]} ${nextMonth.getFullYear()}`}
                  disabled={!monthAllowed(nextMonth.getFullYear(), nextMonth.getMonth())}
                  onClick={() => step(1)}
                  className={`${PLAIN} grid h-11 w-11 place-items-center rounded-full !bg-transparent !text-[#1A1A1A] hover:!bg-[#F1F3F5] disabled:!text-[#B9BEC5]`}
                >
                  <ChevronRight size={20} aria-hidden="true" />
                </button>
              </div>
              <div className="grid grid-cols-7 text-center text-xs font-semibold text-[#6B6B6B]" aria-hidden="true">
                {WEEKDAYS.map(([letter, name]) => (
                  <span key={name} className="py-1.5">{letter}</span>
                ))}
              </div>
              <div className="overflow-hidden">
                <motion.div
                  key={`${shown.year}-${shown.month}`}
                  ref={dayGrid}
                  role="group"
                  aria-label={`${MONTHS[shown.month]} ${shown.year}`}
                  onKeyDown={onGridKey}
                  initial={reduceMotion || direction === 0 ? false : { opacity: 0, x: direction * 28 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.22, ease: EASE }}
                  className="grid grid-cols-7 gap-y-1"
                >
                  {Array.from({ length: lead }, (_, index) => (
                    <span key={`lead-${index}`} aria-hidden="true" />
                  ))}
                  {Array.from({ length: total }, (_, index) => {
                    const day = { year: shown.year, month: shown.month, day: index + 1 };
                    const selected = draft !== null && iso(draft) === iso(day);
                    return (
                      <button
                        key={day.day}
                        type="button"
                        data-day={day.day}
                        tabIndex={day.day === focusDay ? 0 : -1}
                        disabled={!allowed(day)}
                        aria-label={spoken(day)}
                        aria-pressed={selected}
                        onClick={() => {
                          setDraft(day);
                          setFocusDay(day.day);
                        }}
                        className={`${PLAIN} relative mx-auto grid h-11 w-11 place-items-center rounded-full !bg-transparent text-[0.9375rem] font-semibold tabular-nums transition-colors duration-150 disabled:!text-[#C9CDD2] ${
                          selected ? "!text-white" : "!text-[#1A1A1A] hover:!bg-[#F1F3F5]"
                        }`}
                      >
                        {selected ? (
                          // One dot that glides to whichever day is picked.
                          <motion.span
                            layoutId={`${id}-picked`}
                            aria-hidden="true"
                            className="absolute inset-0 rounded-full bg-[#1A1A1A]"
                            transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 38, mass: 0.7 }}
                          />
                        ) : null}
                        <span className="relative">{day.day}</span>
                      </button>
                    );
                  })}
                </motion.div>
              </div>
            </div>
          )}
        </div>
      </Sheet>
    </>
  );
}
