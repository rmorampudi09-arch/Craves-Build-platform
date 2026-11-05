"use client";

import { useId } from "react";
import { DeletionNote } from "@/features/account-deletion/components/deletion-page";
import { deletionCopy } from "@/features/account-deletion/domain/deletion-copy";
import type { ScopeChoice } from "@/features/account-deletion/domain/deletion-model";
import type { DeletionScope } from "@/features/account-deletion/domain/deletion-types";

const { chooser } = deletionCopy;

/** One-of-N radio cards. Nothing is picked until the person picks: a wider scope must never be a default. */
export function ScopeChooser({ options, riderNote, value, onChange }: {
  options: ScopeChoice[];
  riderNote: boolean;
  value: DeletionScope | null;
  onChange: (scope: DeletionScope) => void;
}) {
  const id = useId();
  return (
    <fieldset className="space-y-4">
      <legend className="sr-only">{chooser.title}</legend>
      <p className="text-sm leading-6 text-[#6B6B6B]">{chooser.body}</p>
      <div className="space-y-2">
        {options.map((option) => (
          <label
            key={option.scope}
            className="flex cursor-pointer items-start gap-3 rounded-[20px] border border-[#E5E7EB] bg-white p-4 has-[:checked]:border-[#F62E18]"
          >
            <input
              type="radio"
              name={`${id}-scope`}
              value={option.scope}
              checked={value === option.scope}
              onChange={() => onChange(option.scope)}
              aria-labelledby={`${id}-${option.scope}`}
              aria-describedby={`${id}-${option.scope}-hint`}
              className="mt-0.5 h-5 w-5 shrink-0 accent-[#F62E18]"
            />
            <span className="min-w-0 flex-1">
              <span id={`${id}-${option.scope}`} className="block text-base font-semibold text-[#1A1A1A]">{option.title}</span>
              <span id={`${id}-${option.scope}-hint`} className="block text-sm text-[#6B6B6B]">{option.subtitle}</span>
            </span>
          </label>
        ))}
      </div>
      {riderNote ? <p className="text-sm leading-6 text-[#6B6B6B]">{chooser.riderNote}</p> : null}
      <DeletionNote tone="warning" text={chooser.info} />
    </fieldset>
  );
}
