import { FaLocationDot, FaPen } from "react-icons/fa6";

interface AddressCardProps {
  addressLine: string;
  onEdit: () => void;
}

export function AddressCard({ addressLine, onEdit }: AddressCardProps) {
  return (
    <section
      aria-labelledby="profile-address-title"
      className="flex min-h-[88px] items-center justify-between gap-4 rounded-2xl border border-[#D8DADD] bg-white p-4 shadow-[0_3px_10px_rgba(0,0,0,0.07)]"
    >
      <div className="flex min-w-0 items-start gap-3.5">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]">
          <FaLocationDot className="text-[22px]" aria-hidden="true" />
        </div>
        <div className="min-w-0 pt-0.5">
          <h2
            id="profile-address-title"
            className="text-base font-semibold text-[#1A1A1A]"
          >
            Delivery address
          </h2>
          <p className="mt-1 text-sm leading-5 text-[#6B6B6B]">
            {addressLine}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="group inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-2.5 text-sm font-semibold !text-[#F62E18] transition-colors hover:!bg-[#F62E18] hover:!text-white"
        aria-label="Edit delivery addresses"
      >
        <FaPen className="text-sm" aria-hidden="true" />
        <span className="hidden sm:inline">Edit</span>
      </button>
    </section>
  );
}

export default AddressCard;
