/**
 * The visible mark after a required field's label. The "*" is drawn by CSS with empty
 * alternative text, so it never joins the field's name; the control itself carries
 * `required` or `aria-required`, and screen readers hear "required" once, from the field.
 */
export function RequiredMark() {
  return <span aria-hidden="true" className="craves-required-mark" />;
}

/** One line above a form that explains the mark. */
export function RequiredLegend({ className = "" }: { className?: string }) {
  return (
    <p className={`text-xs font-medium text-[#6B6B6B] ${className}`}>
      Fields marked{" "}
      <span aria-hidden="true" className="font-bold text-[#C4200F]">
        *
      </span>
      <span className="sr-only">with an asterisk</span> are required.
    </p>
  );
}
