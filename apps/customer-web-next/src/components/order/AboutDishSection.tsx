import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export function AboutDishSection({ description }: { description: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = description.length > 110;

  return (
    <section className="mt-7">
      <h2 className="font-display text-lg font-black text-[#1A1A1A]">About this dish</h2>
      <p className={`mt-2 text-sm leading-6 text-[#6B6B6B] ${!expanded && isLong ? "line-clamp-2" : ""}`}>
        {description}
      </p>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-2 flex items-center gap-1 text-sm font-black text-[#F62E18]"
        >
          {expanded ? "Read Less" : "Read More"}
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      )}
    </section>
  );
}

export default AboutDishSection;
