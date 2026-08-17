import { FaCircleCheck, FaEnvelope, FaPen, FaPhone } from "react-icons/fa6";
import type { CustomerProfile } from "@/lib/profile-contract";
import type { CravesUser } from "@/services/auth/cravesAuth";

interface AccountCardProps {
  user: CravesUser;
  profile: CustomerProfile | null;
  orderCount: number;
  addressCount: number;
  onEdit: () => void;
}

export function AccountCard({
  user,
  profile,
  orderCount,
  addressCount,
  onEdit,
}: AccountCardProps) {
  const firstName = profile?.firstName ?? user.firstName;
  const lastName = profile?.lastName ?? user.lastName;
  const name = `${firstName ?? ""} ${lastName ?? ""}`.trim();
  const displayName = name || "Complete your Craves profile";
  const phone = profile?.registeredPhoneNumber || user.phoneNumber;
  const email = profile?.email ?? user.email;

  return (
    <section
      aria-labelledby="customer-profile-name"
      className="overflow-hidden rounded-2xl border border-[#D8DADD] bg-white p-5 shadow-[0_4px_14px_rgba(0,0,0,0.08)] sm:p-6"
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6B6B6B]">
            Customer account
          </p>
          <h1
            id="customer-profile-name"
            className="mt-2 truncate text-2xl font-semibold text-[#1A1A1A]"
          >
            {displayName}
          </h1>

          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-[#1A1A1A]">
            <span className="inline-flex items-center gap-2">
              <FaPhone className="text-sm text-[#1A1A1A]" aria-hidden="true" />
              <span>{phone}</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-md border border-[#F62E18]/25 bg-white px-2.5 py-1 text-xs font-semibold text-[#F62E18]">
              <FaCircleCheck className="text-[#F62E18]" aria-hidden="true" />
              Verified
            </span>
          </div>

          {email && (
            <p className="mt-2.5 flex min-w-0 items-center gap-2 text-sm text-[#1A1A1A]">
              <FaEnvelope className="shrink-0 text-sm" aria-hidden="true" />
              <span className="truncate">{email}</span>
            </p>
          )}

          {!profile && (
            <p className="mt-3 max-w-md text-sm leading-6 text-[#C92716]">
              Add your first name, last name and optional email so checkout and
              support use the correct details.
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={onEdit}
          className="group inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold !text-[#F62E18] transition-colors hover:!bg-[#F62E18] hover:!text-white"
          aria-label="Edit customer profile"
        >
          <FaPen className="text-sm" aria-hidden="true" />
          <span>Edit profile</span>
        </button>
      </div>

      <dl className="mt-6 grid grid-cols-3 divide-x divide-[#E5E7EB] border-t border-[#E5E7EB] pt-5 text-center">
        <div className="px-2">
          <dt className="text-xs text-[#6B6B6B]">Orders</dt>
          <dd className="mt-1 text-xl font-semibold text-[#1A1A1A]">
            {orderCount}
          </dd>
        </div>
        <div className="px-2">
          <dt className="text-xs text-[#6B6B6B]">Addresses</dt>
          <dd className="mt-1 text-xl font-semibold text-[#1A1A1A]">
            {addressCount}
          </dd>
        </div>
        <div className="px-2">
          <dt className="text-xs text-[#6B6B6B]">Profile</dt>
          <dd className="mt-1 text-sm font-semibold text-[#1A1A1A]">
            {profile ? "Complete" : "Action needed"}
          </dd>
        </div>
      </dl>
    </section>
  );
}

export default AccountCard;
