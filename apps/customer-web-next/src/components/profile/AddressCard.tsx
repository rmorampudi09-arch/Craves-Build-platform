import { FaLocationDot, FaPen } from "react-icons/fa6";

import { rememberReturnRoute } from "@/lib/return-navigation";

interface AddressCardProps {
  addressLine: string;
  onEdit: () => void;
}

export function AddressCard({ addressLine, onEdit }: AddressCardProps) {
  const editAddresses = () => {
    rememberReturnRoute("/addresses", "/profile");
    onEdit();
  };

  return (
    <section
      aria-labelledby="profile-address-title"
      className="flex min-h-[76px] items-center justify-between gap-3 rounded-2xl border border-[#E5E7EB] bg-white p-3.5 transition-shadow hover:shadow-[0_8px_22px_rgba(26,26,26,0.07)] sm:p-4"
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]">
          <FaLocationDot className="text-[19px]" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h3
            id="profile-address-title"
            className="text-sm font-black text-[#1A1A1A] sm:text-[0.95rem]"
          >
            Delivery addresses
          </h3>
          <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-[#6B6B6B]">
            {addressLine}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={editAddresses}
        className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-[#F1F3F5] px-3 text-xs font-black !text-[#F62E18] transition-colors hover:!bg-white"
        aria-label="Edit delivery addresses"
      >
        <FaPen className="text-xs" aria-hidden="true" />
        <span className="hidden sm:inline">Edit</span>
      </button>
    </section>
  );
}

export default AddressCard;
