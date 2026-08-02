import { MapPin, Edit2 } from "lucide-react";

interface AddressCardProps {
  addressLine: string;
  onEdit: () => void;
}

/** "Address details" card with the saved delivery address and an Edit button. */
export function AddressCard({ addressLine, onEdit }: AddressCardProps) {
  return (
    <section className="mt-4 rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
            <MapPin className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-display text-base font-bold text-ink">Address details</h2>
            <p className="mt-1 text-sm text-ink/80">{addressLine}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="flex shrink-0 items-center gap-1 rounded-full border border-border bg-white px-3 py-1.5 text-xs font-semibold text-ink hover:border-primary"
        >
          <Edit2 className="h-3.5 w-3.5" /> Edit
        </button>
      </div>
    </section>
  );
}

export default AddressCard;
