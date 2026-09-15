import { statusTone } from "@/lib/format";

export function StatusPill({ value }: { value: string | null | undefined }) {
  const text = value?.trim() || "—";
  return <span className={`status-pill status-${statusTone(text)}`}>{text.replaceAll("_", " ")}</span>;
}
