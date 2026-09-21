import {
  FaCircleCheck,
  FaEnvelope,
  FaPen,
  FaPhone,
} from "react-icons/fa6";

import type { CustomerProfile } from "@/lib/profile-contract";
import type { CravesUser } from "@/services/auth/cravesAuth";

interface AccountCardProps {
  user: CravesUser;
  profile: CustomerProfile | null;
  orderCount: number;
  addressCount: number;
  onEdit: () => void;
}

function initials(value: string): string {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (
      (words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")
    ).toUpperCase();
  }
  return value.slice(0, 2).toUpperCase() || "C";
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
  const name = ((firstName ?? "") + " " + (lastName ?? "")).trim();
  const displayName = name || user.username || "Craves customer";
  const phone = profile?.registeredPhoneNumber || user.phoneNumber;
  const email = profile?.email ?? user.email ?? null;
  const profileReady = Boolean(profile && firstName && lastName);

  return (
    <section
      aria-labelledby="customer-profile-name"
      className="overflow-hidden rounded-[1.6rem] border border-[#E5E7EB] bg-white p-4 shadow-[0_12px_34px_rgba(26,26,26,0.07)] sm:p-5 md:rounded-[1.8rem] md:p-6"
    >
      <div className="flex items-start gap-3.5 sm:gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#FFF1EF] text-xl font-black text-[#F62E18] sm:h-20 sm:w-20 sm:text-2xl">
          {initials(displayName)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[0.62rem] font-black uppercase tracking-[0.12em] text-[#6B6B6B]">
                Customer account
              </p>
              <h1
                id="customer-profile-name"
                className="mt-1.5 truncate text-xl font-black tracking-[-0.025em] text-[#1A1A1A] sm:text-2xl"
              >
                {displayName}
              </h1>
            </div>

            <button
              type="button"
              onClick={onEdit}
              className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full bg-[#F1F3F5] px-3 text-xs font-black !text-[#F62E18] transition-[background-color,box-shadow] hover:!bg-white hover:shadow-[0_6px_16px_rgba(26,26,26,0.08)]"
              aria-label="Edit customer profile"
            >
              <FaPen className="text-xs" aria-hidden="true" />
              <span className="hidden sm:inline">Edit profile</span>
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span
              className={[
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.67rem] font-bold",
                profileReady
                  ? "bg-[#EDF7EE] text-[#2E7D32]"
                  : "bg-[#F1F3F5] text-[#6B6B6B]",
              ].join(" ")}
            >
              <FaCircleCheck aria-hidden="true" />
              {profileReady ? "Profile ready" : "Profile incomplete"}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-2.5 rounded-2xl bg-[#F8F9FA] p-3 sm:grid-cols-2">
        <div className="flex min-w-0 items-center gap-2.5 rounded-xl bg-white px-3 py-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]">
            <FaPhone className="text-xs" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-[0.62rem] font-bold text-[#6B6B6B]">
              Registered phone
            </p>
            <p className="truncate text-xs font-black text-[#1A1A1A]">
              {phone}
            </p>
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-2.5 rounded-xl bg-white px-3 py-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]">
            <FaEnvelope className="text-xs" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[0.62rem] font-bold text-[#6B6B6B]">
              {user.emailVerified ? "Verified email" : "Email"}
            </p>
            <p className="truncate text-xs font-black text-[#1A1A1A]">
              {email || "Add an email"}
            </p>
          </div>
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-3 divide-x divide-[#E5E7EB] border-t border-[#E5E7EB] pt-4 text-center">
        <div className="px-2">
          <dt className="text-[0.68rem] font-semibold text-[#6B6B6B]">
            Orders
          </dt>
          <dd className="mt-1 text-lg font-black text-[#1A1A1A]">
            {orderCount}
          </dd>
        </div>
        <div className="px-2">
          <dt className="text-[0.68rem] font-semibold text-[#6B6B6B]">
            Addresses
          </dt>
          <dd className="mt-1 text-lg font-black text-[#1A1A1A]">
            {addressCount}
          </dd>
        </div>
        <div className="px-2">
          <dt className="text-[0.68rem] font-semibold text-[#6B6B6B]">
            Phone
          </dt>
          <dd className="mt-1 text-xs font-black text-[#2E7D32]">
            Verified
          </dd>
        </div>
      </dl>
    </section>
  );
}

export default AccountCard;
