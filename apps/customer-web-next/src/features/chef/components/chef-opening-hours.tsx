"use client";

import { useId, useRef, useState } from "react";
import { AlertTriangle, CalendarDays, ChevronRight, Plus, RefreshCw, X } from "lucide-react";
import { AppleSwitch } from "@/shared/ui/AppleSwitch";
import { ComingSoon } from "@/shared/ui/feedback/ComingSoon";
import { Sheet, secondaryActionClass } from "@/shared/ui/overlays/overlay";
import {
  changeKitchenSchedule,
  deleteScheduleOverride,
  fetchScheduleOverride,
  HOURS_SAVE_FAILED,
  reloadKitchenSchedule,
  saveScheduleOverride,
  scheduleUpdate,
  useKitchenSchedule,
} from "@/features/chef/api/chef-kitchen-schedule";
import { ChefSkeletonRow } from "@/features/chef/components/chef-loading";
import { ChefEmpty, ChefFlash, ChefSection } from "@/features/chef/components/chef-ui";
import { chefErrorText } from "@/features/chef/lib/chef-errors";
import { SCHEDULE_REASON_MAX } from "@/features/chef/lib/chef-schedule-contract";
import {
  DAYS,
  dayLabel,
  defaultRanges,
  formatHoursTime,
  kitchenClock,
  MAX_RANGES,
  rangesForDay,
  secondRange,
  summarizeRanges,
  timeOptions,
  upcomingDays,
  validateRanges,
  withDayRanges,
  type TimeRange,
} from "@/features/chef/lib/opening-hours";

type SpecialDay = { date: string; closed: boolean; reason: string | null; windows: TimeRange[] };

// Sheets open outside the chef page: this brings the chef controls' look into them.
const SHEET_BODY = "chef-panel-theme !min-h-0 mt-5 grid gap-5";
const ROW = "chef-row !rounded-none !border-0 !bg-transparent";

function SwitchRow({
  title,
  label,
  checked,
  onChange,
}: {
  title: string;
  label: string;
  checked: boolean;
  onChange(next: boolean): void;
}) {
  return (
    <div className="chef-setting-row !py-0">
      <p className="chef-setting-title min-w-0 flex-1" aria-hidden="true">
        {title}
      </p>
      <AppleSwitch
        checked={checked}
        onCheckedChange={onChange}
        size="md"
        tone="go"
        aria-label={label}
      />
    </div>
  );
}

function TimeSelect({
  label,
  value,
  closing,
  onChange,
}: {
  label: string;
  value: string;
  closing: boolean;
  onChange(time: string): void;
}) {
  return (
    <label className="grid min-w-0 flex-1 gap-1 text-sm font-semibold text-[#1A1A1A]">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-12 w-full rounded-xl px-3 text-base"
      >
        {timeOptions([value], closing).map((time) => (
          <option key={time} value={time}>
            {formatHoursTime(time)}
          </option>
        ))}
      </select>
    </label>
  );
}

/** One or two time ranges, each an opening and a closing time. */
function RangesEditor({
  ranges,
  onChange,
}: {
  ranges: TimeRange[];
  onChange(next: TimeRange[]): void;
}) {
  const set = (index: number, field: keyof TimeRange, time: string) =>
    onChange(ranges.map((range, other) => (other === index ? { ...range, [field]: time } : range)));
  return (
    <div className="grid gap-3">
      {ranges.map((range, index) => (
        <div key={index} className="flex items-end gap-2">
          <TimeSelect
            label={index ? "Opens (second time)" : "Opens"}
            value={range.opensAt}
            closing={false}
            onChange={(time) => set(index, "opensAt", time)}
          />
          <TimeSelect
            label={index ? "Closes (second time)" : "Closes"}
            value={range.closesAt}
            closing
            onChange={(time) => set(index, "closesAt", time)}
          />
          {ranges.length > 1 ? (
            <button
              type="button"
              className="chef-icon-button mb-0.5 shrink-0"
              aria-label={`Remove time ${index + 1}`}
              onClick={() => onChange(ranges.filter((_, other) => other !== index))}
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      ))}
      {ranges.length < MAX_RANGES ? (
        <button
          type="button"
          className="chef-btn is-small is-quiet justify-self-start"
          onClick={() => onChange([...ranges, secondRange()])}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add another time
        </button>
      ) : null}
    </div>
  );
}

function SaveButton({ saving, onClick }: { saving: boolean; onClick(): void }) {
  return (
    <button
      type="button"
      className="craves-primary-action w-full"
      disabled={saving}
      aria-busy={saving}
      onClick={onClick}
    >
      {saving ? "Saving…" : "Save"}
    </button>
  );
}

const Problem = ({ text }: { text: string }) =>
  text ? (
    <p role="alert" className="chef-field-error !mt-0 !text-[0.9375rem]">
      {text}
    </p>
  ) : null;

/** A day: Open or Closed, one or two time ranges, and other days to copy them to. */
function DayHoursForm({
  day,
  initial,
  weekHasHours,
  saving,
  error,
  onSave,
}: {
  day: number;
  initial: TimeRange[];
  weekHasHours: boolean;
  saving: boolean;
  error: string;
  onSave(copyTo: number[], ranges: TimeRange[]): void;
}) {
  const [open, setOpen] = useState(initial.length > 0);
  const [ranges, setRanges] = useState(initial.length ? initial : defaultRanges());
  const [copyTo, setCopyTo] = useState<number[]>([]);
  const [problem, setProblem] = useState("");
  const copyId = useId();

  function save() {
    const found = open ? validateRanges(ranges) : null;
    setProblem(found ?? "");
    if (!found) onSave(copyTo, open ? ranges : []);
  }

  return (
    <div className={SHEET_BODY}>
      <SwitchRow title={open ? "Open" : "Closed"} label="Open" checked={open} onChange={setOpen} />
      {open ? (
        <RangesEditor
          ranges={ranges}
          onChange={(next) => {
            setRanges(next);
            setProblem("");
          }}
        />
      ) : null}
      {weekHasHours ? null : (
        <p className="chef-section-note !text-[0.875rem]">
          Days with no hours are closed. Use “Also use these hours on” to set several days at once.
        </p>
      )}
      <div role="group" aria-labelledby={copyId}>
        <p id={copyId} className="chef-field-label">
          Also use these hours on
        </p>
        <div className="chef-chips is-wrap mt-2">
          {DAYS.filter((other) => other.day !== day).map((other) => (
            <button
              key={other.day}
              type="button"
              className="chef-chip"
              aria-label={other.name}
              aria-pressed={copyTo.includes(other.day)}
              onClick={() =>
                setCopyTo(
                  copyTo.includes(other.day)
                    ? copyTo.filter((value) => value !== other.day)
                    : [...copyTo, other.day],
                )
              }
            >
              {other.short}
            </button>
          ))}
        </div>
      </div>
      <Problem text={problem || error} />
      <SaveButton saving={saving} onClick={save} />
    </div>
  );
}

/** A special day: pick a date, then closed all day or different hours. */
function SpecialDayForm({
  today,
  initial,
  saving,
  error,
  onSave,
  onRemove,
}: {
  today: string;
  initial?: SpecialDay;
  saving: boolean;
  error: string;
  onSave(value: SpecialDay): void;
  onRemove(date: string): void;
}) {
  const [date, setDate] = useState(initial?.date ?? "");
  const [existing, setExisting] = useState(!!initial);
  const [checking, setChecking] = useState(false);
  const [closed, setClosed] = useState(initial?.closed ?? true);
  const [ranges, setRanges] = useState(initial?.windows.length ? initial.windows : defaultRanges());
  const [reason, setReason] = useState(initial?.reason ?? "");
  const [problem, setProblem] = useState("");
  const pickId = useId();

  async function choose(next: string) {
    if (checking) return;
    setChecking(true);
    // A failed lookup reads as "nothing set": saving then simply sets the day.
    const found = await fetchScheduleOverride(next).catch(() => null);
    setDate(next);
    setExisting(!!found);
    setClosed(found?.closed ?? true);
    setRanges(found?.windows.length ? found.windows : defaultRanges());
    setReason(found?.reason ?? "");
    setChecking(false);
  }

  if (!date) {
    return (
      <div className={SHEET_BODY} aria-busy={checking}>
        <div role="group" aria-labelledby={pickId}>
          <p id={pickId} className="chef-field-label">
            Pick a date
          </p>
          <div className="chef-chips is-wrap mt-2">
            {upcomingDays(today).map((day) => (
              <button
                key={day.date}
                type="button"
                className="chef-chip"
                disabled={checking}
                onClick={() => void choose(day.date)}
              >
                {day.label}
              </button>
            ))}
          </div>
        </div>
        <p role="status" className="chef-section-note !text-[0.875rem]">
          {checking ? "Checking that day…" : ""}
        </p>
      </div>
    );
  }

  function save() {
    const found = closed ? null : validateRanges(ranges);
    setProblem(found ?? "");
    if (!found)
      onSave({ date, closed, reason: reason.trim() || null, windows: closed ? [] : ranges });
  }

  return (
    <div className={SHEET_BODY}>
      <p className="text-base font-bold text-[#1A1A1A]">{dayLabel(date, today)}</p>
      <SwitchRow
        title="Closed all day"
        label="Closed all day"
        checked={closed}
        onChange={setClosed}
      />
      {closed ? null : (
        <RangesEditor
          ranges={ranges}
          onChange={(next) => {
            setRanges(next);
            setProblem("");
          }}
        />
      )}
      <label className="chef-field-label">
        Reason <span className="font-normal text-[#6B6B6B]">(optional)</span>
        <input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={SCHEDULE_REASON_MAX}
          placeholder="For example, Diwali"
          className="mt-2 min-h-12 w-full rounded-xl px-4 text-base font-normal"
        />
      </label>
      <Problem text={problem || error} />
      <div className="grid gap-2">
        <SaveButton saving={saving} onClick={save} />
        {existing ? (
          <button
            type="button"
            className={`${secondaryActionClass} sm:!w-full`}
            disabled={saving}
            onClick={() => onRemove(date)}
          >
            Remove special day
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Opening hours: the hours for each day of the week, and special days. */
export function ChefOpeningHours() {
  const view = useKitchenSchedule();
  const [editingDay, setEditingDay] = useState<number | null>(null);
  const [special, setSpecial] = useState<{ open: boolean; today: string; initial?: SpecialDay }>({
    open: false,
    today: "",
  });
  const [specials, setSpecials] = useState<SpecialDay[]>([]);
  const [saving, setSaving] = useState(false);
  const [sheetError, setSheetError] = useState("");
  const [flash, setFlash] = useState("");
  const busy = useRef(false);

  if (view.state === "loading") {
    return (
      <ChefSection title="Every week" flush labelledBy="chef-hours">
        <div className="chef-list" aria-busy="true">
          {DAYS.map(({ day }) => (
            <ChefSkeletonRow key={day} media="none" trailing="value" />
          ))}
        </div>
      </ChefSection>
    );
  }
  if (view.state === "soon") {
    return (
      <ComingSoon
        title="Opening hours are on their way"
        message="You will be able to set your weekly hours and special days here soon."
      />
    );
  }
  if (view.state === "error") {
    return (
      <ChefSection>
        <ChefEmpty
          icon={AlertTriangle}
          title="We couldn’t load your opening hours"
          text={view.message}
          action={
            <button
              type="button"
              onClick={() => void reloadKitchenSchedule()}
              className="chef-btn is-primary"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Try again
            </button>
          }
        />
      </ChefSection>
    );
  }

  const { schedule } = view;
  const weekHasHours = schedule.weeklyWindows.length > 0;
  const editing = DAYS.find((day) => day.day === editingDay);

  /** One save at a time; a failure keeps the sheet open with the reason in it. */
  async function save(run: () => Promise<void>, done: string) {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setSheetError("");
    try {
      await run();
      setFlash(done);
    } catch (error) {
      setSheetError(chefErrorText(error, HOURS_SAVE_FAILED));
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  const saveDay = (day: number, copyTo: number[], ranges: TimeRange[]) =>
    save(async () => {
      await changeKitchenSchedule(
        (fresh) =>
          scheduleUpdate(fresh, {
            weeklyWindows: withDayRanges(fresh.weeklyWindows, [day, ...copyTo], ranges),
          }),
        HOURS_SAVE_FAILED,
      );
      setEditingDay(null);
    }, "Opening hours saved");
  const saveSpecial = (value: SpecialDay) =>
    save(async () => {
      await saveScheduleOverride(value.date, {
        closed: value.closed,
        reason: value.reason,
        windows: value.windows,
      });
      setSpecials((previous) =>
        [...previous.filter((item) => item.date !== value.date), value].sort((a, b) =>
          a.date.localeCompare(b.date),
        ),
      );
      setSpecial((current) => ({ ...current, open: false }));
    }, "Special day saved");
  const removeSpecial = (date: string) =>
    save(async () => {
      await deleteScheduleOverride(date);
      setSpecials((previous) => previous.filter((item) => item.date !== date));
      setSpecial((current) => ({ ...current, open: false }));
    }, "Special day removed");
  const openSpecial = (initial?: SpecialDay) => {
    setSheetError("");
    setSpecial({ open: true, today: kitchenClock(new Date(), schedule.timezoneId).date, initial });
  };

  return (
    <>
      <ChefSection
        title="Every week"
        note={
          weekHasHours
            ? undefined
            : "No hours set yet. Until you set them, customers can order whenever your kitchen is open."
        }
        flush
        labelledBy="chef-hours"
      >
        <div className="chef-list">
          {DAYS.map((day) => {
            const lines = summarizeRanges(
              rangesForDay(schedule.weeklyWindows, day.day),
              weekHasHours,
            );
            const set = lines[0] !== "Closed" && lines[0] !== "Not set";
            return (
              <button
                key={day.day}
                type="button"
                className={ROW}
                aria-haspopup="dialog"
                onClick={() => {
                  setSheetError("");
                  setEditingDay(day.day);
                }}
              >
                <span className="chef-row-main chef-row-title">{day.name}</span>
                <span
                  className={`text-right text-[0.875rem] ${set ? "font-semibold text-[#1A1A1A]" : "text-[#6B6B6B]"}`}
                >
                  {lines.map((line) => (
                    <span key={line} className="block">
                      {line}
                    </span>
                  ))}
                </span>
                <ChevronRight className="chef-chevron h-5 w-5" aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </ChefSection>

      <ChefSection
        title="Special days"
        note="Special days you added before show when you pick their date."
        flush
        labelledBy="chef-special-days"
      >
        {specials.length ? (
          <div className="chef-list mt-3 border-y border-[#E3E6EA]">
            {specials.map((item) => (
              <button
                key={item.date}
                type="button"
                className={ROW}
                aria-haspopup="dialog"
                onClick={() => openSpecial(item)}
              >
                <span className="chef-row-icon">
                  <CalendarDays className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="chef-row-main">
                  <span className="chef-row-title block">
                    {dayLabel(item.date, special.today)}
                    {item.reason ? ` · ${item.reason}` : ""}
                  </span>
                  <span className="chef-row-meta block">
                    {item.closed ? "Closed" : summarizeRanges(item.windows, true).join(", ")}
                  </span>
                </span>
                <ChevronRight className="chef-chevron h-5 w-5" aria-hidden="true" />
              </button>
            ))}
          </div>
        ) : null}
        <div className="p-4 md:px-5">
          <button
            type="button"
            className="chef-btn is-small"
            aria-haspopup="dialog"
            onClick={() => openSpecial()}
          >
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            Add a special day
          </button>
        </div>
      </ChefSection>

      <Sheet
        open={editing !== undefined}
        onOpenChange={(open) => {
          if (!open) setEditingDay(null);
        }}
        title={editing?.name ?? ""}
        busy={saving}
      >
        {editing ? (
          <DayHoursForm
            day={editing.day}
            initial={rangesForDay(schedule.weeklyWindows, editing.day)}
            weekHasHours={weekHasHours}
            saving={saving}
            error={sheetError}
            onSave={(copyTo, ranges) => void saveDay(editing.day, copyTo, ranges)}
          />
        ) : null}
      </Sheet>
      <Sheet
        open={special.open}
        onOpenChange={(open) => {
          if (!open) setSpecial((current) => ({ ...current, open: false }));
        }}
        title={special.initial ? "Special day" : "Add a special day"}
        busy={saving}
      >
        {special.open ? (
          <SpecialDayForm
            today={special.today}
            initial={special.initial}
            saving={saving}
            error={sheetError}
            onSave={(value) => void saveSpecial(value)}
            onRemove={(date) => void removeSpecial(date)}
          />
        ) : null}
      </Sheet>
      <ChefFlash message={flash} onClose={() => setFlash("")} />
    </>
  );
}
