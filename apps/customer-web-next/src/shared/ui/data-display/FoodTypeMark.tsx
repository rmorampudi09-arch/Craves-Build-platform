const FOOD_TYPE = {
  VEG: { label: "Veg", color: "#29B47B" },
  EGG: { label: "Egg", color: "#D98C16" },
  NON_VEG: { label: "Non-veg", color: "#C72C21" },
} as const;

/** The square veg / egg / non-veg mark from Indian food packaging (a dot, or a triangle for non-veg). */
export function FoodTypeMark({ foodType, veg }: { foodType?: "VEG" | "NON_VEG" | "EGG"; veg: boolean }) {
  const type = FOOD_TYPE[foodType ?? (veg ? "VEG" : "NON_VEG")];
  return (
    <span role="img" aria-label={type.label} className="flex h-4 w-4 items-center justify-center rounded-[4px] border-[1.5px]" style={{ borderColor: type.color }}>
      {type === FOOD_TYPE.NON_VEG ? (
        <span className="h-0 w-0 border-x-4 border-b-[7px] border-x-transparent" style={{ borderBottomColor: type.color }} />
      ) : (
        <span className="h-[7px] w-[7px] rounded-full" style={{ backgroundColor: type.color }} />
      )}
    </span>
  );
}
