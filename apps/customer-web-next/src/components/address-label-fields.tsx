"use client";

import { useId } from "react";
import {
  ADDRESS_LABEL_MAX_LENGTH,
  addressLabelDraftError,
  type AddressCategory,
  type AddressLabelDraft,
} from "@/lib/address-contract";

export function AddressLabelFields({ value, onChange, disabled = false }: {
  value: AddressLabelDraft;
  onChange(value: AddressLabelDraft): void;
  disabled?: boolean;
}) {
  const id = useId();
  const error = addressLabelDraftError(value);
  return (
    <fieldset disabled={disabled} className="grid gap-3 sm:col-span-2">
      <legend className="mb-2 text-sm font-semibold">Address type</legend>
      <div className="flex gap-2">
        {(["HOME", "WORK", "OTHER"] as AddressCategory[]).map((category) => (
          <button
            key={category}
            type="button"
            aria-pressed={value.addressCategory === category}
            onClick={() => onChange({ ...value, addressCategory: category })}
            className={`min-h-11 flex-1 rounded-xl border px-3 py-2 text-sm font-semibold ${value.addressCategory === category ? "border-[#F62E18] bg-red-50 text-[#B81F10]" : "border-slate-300 bg-white text-slate-800"}`}
          >
            {category === "HOME" ? "Home" : category === "WORK" ? "Work" : "Other"}
          </button>
        ))}
      </div>
      {value.addressCategory === "OTHER" && (
        <div>
          <label htmlFor={id} className="text-sm font-semibold">Address name</label>
          <input
            id={id}
            type="text"
            required
            maxLength={ADDRESS_LABEL_MAX_LENGTH}
            value={value.customLabel}
            placeholder="e.g. Mom's House"
            autoComplete="off"
            aria-invalid={Boolean(error)}
            aria-describedby={`${id}-help`}
            onChange={(event) => onChange({ ...value, customLabel: event.target.value })}
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-950"
          />
          <p id={`${id}-help`} className={`mt-1 text-xs ${error ? "text-red-700" : "text-slate-600"}`}>
            {error ?? `${value.customLabel.trim().length}/${ADDRESS_LABEL_MAX_LENGTH} characters`}
          </p>
        </div>
      )}
    </fieldset>
  );
}
