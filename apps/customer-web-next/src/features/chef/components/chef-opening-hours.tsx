"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CalendarDays, ChevronRight, Plus, RefreshCw, X } from "lucide-react";
import { AppleSwitch } from "@/shared/ui/AppleSwitch";
import { ComingSoon } from "@/shared/ui/feedback/ComingSoon";
import { Sheet, secondaryActionClass } from "@/shared/ui/overlays/overlay";
import {
  changeKitchenSchedule,
  deleteScheduleOverride,
  fetchScheduleOverride,
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
  dayName,
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
import { format, messages } from "@/shared/i18n/language";
import { useLanguage, useText } from "@/shared/i18n/language-context";

type SpecialDay = { date: string; closed: boolean; reason: string | null; windows: TimeRange[] };

// Sheets open outside the chef page: this brings the chef controls' look into them.
const SHEET_BODY = "chef-panel-theme chef-sheet-theme mt-5 grid gap-5";
const ROW = "chef-row !rounded-none !border-0 !bg-transparent";

const TEXT = messages({
  en: {
    opens: "Opens", closes: "Closes", secondTime: " (second time)", removeTime: "Remove time {number}", addTime: "Add another time",
    saving: "Saving…", save: "Save", open: "Open", closed: "Closed",
    daysNote: "Days with no hours are closed. Use “Also use these hours on” to set several days at once.", alsoUse: "Also use these hours on",
    pickDate: "Pick a date", checkingDay: "Checking that day…", closedAllDay: "Closed all day", reason: "Reason", optional: "(optional)",
    example: "For example, Diwali", removeSpecial: "Remove special day",
    everyWeek: "Every week", noHours: "No hours set yet. Until you set them, customers can order whenever your kitchen is open.",
    soonTitle: "Opening hours are on their way", soonText: "You will be able to set your weekly hours and special days here soon.",
    loadFailed: "We couldn’t load your opening hours", tryAgain: "Try again", saveFailed: "We couldn’t save your hours. Please try again.",
    hoursSaved: "Opening hours saved", specialSaved: "Special day saved", specialRemoved: "Special day removed",
    specialDays: "Special days", specialNote: "Special days you added before show when you pick their date.",
    addSpecial: "Add a special day", specialDay: "Special day",
  },
  te: {
    opens: "తెరిచే సమయం", closes: "మూసే సమయం", secondTime: " (రెండో సమయం)", removeTime: "సమయం {number} తీసేయండి", addTime: "ఇంకో సమయం జోడించండి",
    saving: "సేవ్ అవుతోంది…", save: "సేవ్ చేయండి", open: "తెరిచి ఉంటుంది", closed: "మూసి ఉంటుంది",
    daysNote: "సమయాలు లేని రోజులు మూసి ఉంటాయి. చాలా రోజులకు ఒకేసారి పెట్టడానికి “ఈ సమయాలు ఈ రోజులకు కూడా” వాడండి.", alsoUse: "ఈ సమయాలు ఈ రోజులకు కూడా",
    pickDate: "తేదీ ఎంచుకోండి", checkingDay: "ఆ రోజును చూస్తున్నాం…", closedAllDay: "రోజంతా మూసి ఉంటుంది", reason: "కారణం", optional: "(ఇష్టమైతే)",
    example: "ఉదాహరణకు, దీపావళి", removeSpecial: "ప్రత్యేక రోజు తీసేయండి",
    everyWeek: "ప్రతి వారం", noHours: "ఇంకా సమయాలు పెట్టలేదు. పెట్టే వరకు, మీ వంటగది తెరిచి ఉన్నప్పుడు ఎప్పుడైనా కస్టమర్లు ఆర్డర్ చేయవచ్చు.",
    soonTitle: "వంటగది సమయాలు త్వరలో వస్తాయి", soonText: "త్వరలో ఇక్కడ మీ వారపు సమయాలు, ప్రత్యేక రోజులు పెట్టుకోవచ్చు.",
    loadFailed: "మీ వంటగది సమయాలు లోడ్ చేయలేకపోయాం", tryAgain: "మళ్లీ ప్రయత్నించండి", saveFailed: "మీ సమయాలు సేవ్ చేయలేకపోయాం. దయచేసి మళ్లీ ప్రయత్నించండి.",
    hoursSaved: "వంటగది సమయాలు సేవ్ అయ్యాయి", specialSaved: "ప్రత్యేక రోజు సేవ్ అయింది", specialRemoved: "ప్రత్యేక రోజు తీసేశాం",
    specialDays: "ప్రత్యేక రోజులు", specialNote: "ముందు జోడించిన ప్రత్యేక రోజులు, ఆ తేదీ ఎంచుకున్నప్పుడు కనిపిస్తాయి.",
    addSpecial: "ప్రత్యేక రోజు జోడించండి", specialDay: "ప్రత్యేక రోజు",
  },
  kn: {
    opens: "ತೆರೆಯುವ ಸಮಯ", closes: "ಮುಚ್ಚುವ ಸಮಯ", secondTime: " (ಎರಡನೇ ಸಮಯ)", removeTime: "ಸಮಯ {number} ತೆಗೆದುಹಾಕಿ", addTime: "ಇನ್ನೊಂದು ಸಮಯ ಸೇರಿಸಿ",
    saving: "ಉಳಿಸಲಾಗುತ್ತಿದೆ…", save: "ಉಳಿಸಿ", open: "ತೆರೆದಿರುತ್ತದೆ", closed: "ಮುಚ್ಚಿರುತ್ತದೆ",
    daysNote: "ಸಮಯ ಇಲ್ಲದ ದಿನಗಳು ಮುಚ್ಚಿರುತ್ತವೆ. ಹಲವು ದಿನಗಳಿಗೆ ಒಮ್ಮೆಲೇ ಹಾಕಲು “ಈ ಸಮಯ ಈ ದಿನಗಳಿಗೂ” ಬಳಸಿ.", alsoUse: "ಈ ಸಮಯ ಈ ದಿನಗಳಿಗೂ",
    pickDate: "ದಿನಾಂಕ ಆಯ್ಕೆಮಾಡಿ", checkingDay: "ಆ ದಿನವನ್ನು ನೋಡುತ್ತಿದ್ದೇವೆ…", closedAllDay: "ದಿನವಿಡೀ ಮುಚ್ಚಿರುತ್ತದೆ", reason: "ಕಾರಣ", optional: "(ಬೇಕಿದ್ದರೆ)",
    example: "ಉದಾಹರಣೆಗೆ, ದೀಪಾವಳಿ", removeSpecial: "ವಿಶೇಷ ದಿನ ತೆಗೆದುಹಾಕಿ",
    everyWeek: "ಪ್ರತಿ ವಾರ", noHours: "ಇನ್ನೂ ಸಮಯ ಹಾಕಿಲ್ಲ. ಹಾಕುವವರೆಗೆ, ನಿಮ್ಮ ಅಡುಗೆಮನೆ ತೆರೆದಿರುವಾಗ ಯಾವಾಗ ಬೇಕಾದರೂ ಗ್ರಾಹಕರು ಆರ್ಡರ್ ಮಾಡಬಹುದು.",
    soonTitle: "ಅಡುಗೆಮನೆ ಸಮಯ ಶೀಘ್ರದಲ್ಲೇ ಬರಲಿದೆ", soonText: "ಶೀಘ್ರದಲ್ಲೇ ಇಲ್ಲಿ ನಿಮ್ಮ ವಾರದ ಸಮಯ ಮತ್ತು ವಿಶೇಷ ದಿನಗಳನ್ನು ಹಾಕಬಹುದು.",
    loadFailed: "ನಿಮ್ಮ ಅಡುಗೆಮನೆ ಸಮಯ ಲೋಡ್ ಮಾಡಲು ಆಗಲಿಲ್ಲ", tryAgain: "ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ", saveFailed: "ನಿಮ್ಮ ಸಮಯವನ್ನು ಉಳಿಸಲು ಆಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
    hoursSaved: "ಅಡುಗೆಮನೆ ಸಮಯ ಉಳಿಸಲಾಗಿದೆ", specialSaved: "ವಿಶೇಷ ದಿನ ಉಳಿಸಲಾಗಿದೆ", specialRemoved: "ವಿಶೇಷ ದಿನ ತೆಗೆದುಹಾಕಲಾಗಿದೆ",
    specialDays: "ವಿಶೇಷ ದಿನಗಳು", specialNote: "ಮೊದಲು ಸೇರಿಸಿದ ವಿಶೇಷ ದಿನಗಳು, ಆ ದಿನಾಂಕ ಆಯ್ಕೆಮಾಡಿದಾಗ ಕಾಣುತ್ತವೆ.",
    addSpecial: "ವಿಶೇಷ ದಿನ ಸೇರಿಸಿ", specialDay: "ವಿಶೇಷ ದಿನ",
  },
});

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
  label: ReactNode;
  value: string;
  closing: boolean;
  onChange(time: string): void;
}) {
  const { language } = useLanguage();
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
            {formatHoursTime(time, language)}
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
  const text = useText(TEXT);
  const set = (index: number, field: keyof TimeRange, time: string) =>
    onChange(ranges.map((range, other) => (other === index ? { ...range, [field]: time } : range)));
  return (
    <div className="grid gap-3">
      {ranges.map((range, index) => (
        <div key={index} className="flex items-end gap-2">
          <TimeSelect
            label={<>{text.opens}{index ? <span className="sr-only">{text.secondTime}</span> : null}</>}
            value={range.opensAt}
            closing={false}
            onChange={(time) => set(index, "opensAt", time)}
          />
          <TimeSelect
            label={<>{text.closes}{index ? <span className="sr-only">{text.secondTime}</span> : null}</>}
            value={range.closesAt}
            closing
            onChange={(time) => set(index, "closesAt", time)}
          />
          {ranges.length > 1 ? (
            <button
              type="button"
              className="chef-icon-button mb-0.5 shrink-0"
              aria-label={format(text.removeTime, { number: index + 1 })}
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
          {text.addTime}
        </button>
      ) : null}
    </div>
  );
}

function SaveButton({ saving, onClick }: { saving: boolean; onClick(): void }) {
  const text = useText(TEXT);
  return (
    <button
      type="button"
      className="craves-primary-action w-full"
      disabled={saving}
      aria-busy={saving}
      onClick={onClick}
    >
      {saving ? text.saving : text.save}
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
  const text = useText(TEXT);
  const { language } = useLanguage();
  const [open, setOpen] = useState(initial.length > 0);
  const [ranges, setRanges] = useState(initial.length ? initial : defaultRanges());
  const [copyTo, setCopyTo] = useState<number[]>([]);
  const [problem, setProblem] = useState("");
  const copyId = useId();

  function save() {
    const found = open ? validateRanges(ranges, language) : null;
    setProblem(found ?? "");
    if (!found) onSave(copyTo, open ? ranges : []);
  }

  return (
    <div className={SHEET_BODY}>
      <SwitchRow title={open ? text.open : text.closed} label={text.open} checked={open} onChange={setOpen} />
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
          {text.daysNote}
        </p>
      )}
      <div role="group" aria-labelledby={copyId}>
        <p id={copyId} className="chef-field-label">
          {text.alsoUse}
        </p>
        <div className="chef-chips is-wrap mt-2">
          {DAYS.filter((other) => other.day !== day).map((other) => (
            <button
              key={other.day}
              type="button"
              className="chef-chip"
              aria-label={dayName(other.day, language)}
              aria-pressed={copyTo.includes(other.day)}
              onClick={() =>
                setCopyTo(
                  copyTo.includes(other.day)
                    ? copyTo.filter((value) => value !== other.day)
                    : [...copyTo, other.day],
                )
              }
            >
              {dayName(other.day, language, true)}
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
  const text = useText(TEXT);
  const { language } = useLanguage();
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
            {text.pickDate}
          </p>
          <div className="chef-chips is-wrap mt-2">
            {upcomingDays(today, language).map((day) => (
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
          {checking ? text.checkingDay : ""}
        </p>
      </div>
    );
  }

  function save() {
    const found = closed ? null : validateRanges(ranges, language);
    setProblem(found ?? "");
    if (!found)
      onSave({ date, closed, reason: reason.trim() || null, windows: closed ? [] : ranges });
  }

  return (
    <div className={SHEET_BODY}>
      <p className="text-base font-bold text-[#1A1A1A]">{dayLabel(date, today, language)}</p>
      <SwitchRow
        title={text.closedAllDay}
        label={text.closedAllDay}
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
        {text.reason} <span className="font-normal text-[#6B6B6B]">{text.optional}</span>
        <input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={SCHEDULE_REASON_MAX}
          placeholder={text.example}
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
            {text.removeSpecial}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Opening hours: the hours for each day of the week, and special days. */
export function ChefOpeningHours() {
  const text = useText(TEXT);
  const { language } = useLanguage();
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
  const ready = view.state === "ready";

  // Older links carry #chef-hours; the hours only exist once read.
  useEffect(() => {
    if (ready && window.location.hash === "#chef-hours") document.getElementById("chef-hours")?.scrollIntoView();
  }, [ready]);

  if (view.state === "loading") {
    return (
      <ChefSection title={text.everyWeek} flush labelledBy="chef-hours">
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
        title={text.soonTitle}
        message={text.soonText}
      />
    );
  }
  if (view.state === "error") {
    return (
      <ChefSection>
        <ChefEmpty
          icon={AlertTriangle}
          title={text.loadFailed}
          text={view.message}
          action={
            <button
              type="button"
              onClick={() => void reloadKitchenSchedule()}
              className="chef-btn is-primary"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              {text.tryAgain}
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
      setSheetError(chefErrorText(error, text.saveFailed));
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
        text.saveFailed,
      );
      setEditingDay(null);
    }, text.hoursSaved);
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
    }, text.specialSaved);
  const removeSpecial = (date: string) =>
    save(async () => {
      await deleteScheduleOverride(date);
      setSpecials((previous) => previous.filter((item) => item.date !== date));
      setSpecial((current) => ({ ...current, open: false }));
    }, text.specialRemoved);
  const openSpecial = (initial?: SpecialDay) => {
    setSheetError("");
    setSpecial({ open: true, today: kitchenClock(new Date(), schedule.timezoneId).date, initial });
  };

  return (
    <>
      <ChefSection
        title={text.everyWeek}
        note={weekHasHours ? undefined : text.noHours}
        flush
        labelledBy="chef-hours"
      >
        <div className="chef-list">
          {DAYS.map((day) => {
            const ranges = rangesForDay(schedule.weeklyWindows, day.day);
            const lines = summarizeRanges(ranges, weekHasHours, language);
            const set = ranges.length > 0;
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
                <span className="chef-row-main chef-row-title">{dayName(day.day, language)}</span>
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
        title={text.specialDays}
        note={text.specialNote}
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
                    {dayLabel(item.date, special.today, language)}
                    {item.reason ? ` · ${item.reason}` : ""}
                  </span>
                  <span className="chef-row-meta block">
                    {item.closed ? text.closed : summarizeRanges(item.windows, true, language).join(", ")}
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
            {text.addSpecial}
          </button>
        </div>
      </ChefSection>

      <Sheet
        open={editing !== undefined}
        onOpenChange={(open) => {
          if (!open) setEditingDay(null);
        }}
        title={editing ? dayName(editing.day, language) : ""}
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
        title={special.initial ? text.specialDay : text.addSpecial}
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
