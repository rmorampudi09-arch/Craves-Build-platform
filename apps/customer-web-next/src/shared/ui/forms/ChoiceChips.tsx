/** A pill in a filter row; `on` while its filter or sort is applied. */
export const filterPillClass = (on: boolean) =>
  `inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full !border px-3.5 text-[0.8125rem] font-bold !shadow-none transition-[background-color,border-color,scale] duration-(--dur-micro) active:scale-[0.97] ${
    on
      ? "!border-[#1A1A1A] !bg-[#F1F3F5] !text-[#1A1A1A]"
      : "!border-[#E5E7EB] !bg-white !text-[#1A1A1A] hover:!bg-[#F1F3F5]"
  }`;

/** One choice out of a few, as chips (a radio group), for filter and sort sheets. */
export function ChoiceChips<Value extends string>({
  legend,
  name,
  value,
  options,
  onChange,
}: {
  legend: string;
  name: string;
  value: Value;
  options: readonly (readonly [Value, string])[];
  onChange: (value: Value) => void;
}) {
  return (
    <fieldset className="mt-6 first:mt-5">
      <legend className="text-sm font-bold text-[#1A1A1A]">{legend}</legend>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {options.map(([option, label]) => (
          <label key={option} className="relative">
            <input
              type="radio"
              name={name}
              value={option}
              checked={value === option}
              onChange={() => onChange(option)}
              className="peer sr-only"
            />
            <span className="inline-flex min-h-10 cursor-pointer items-center rounded-full border border-[#E5E7EB] bg-white px-3.5 text-sm font-semibold text-[#1A1A1A] transition-colors duration-(--dur-micro) peer-checked:border-[#1A1A1A] peer-checked:bg-[#1A1A1A] peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-[#1A1A1A]/35 peer-focus-visible:ring-offset-2">
              {label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
