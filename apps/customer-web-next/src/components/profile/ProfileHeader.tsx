import { Link } from "@tanstack/react-router";
import { FaArrowLeft } from "react-icons/fa6";
import { CravesLogo } from "@/components/brand/CravesLogo";
import { PersistentCustomerServiceNav } from "@/components/navigation/PersistentCustomerServiceNav";

export function ProfileHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-[#E5E7EB] bg-white/95 backdrop-blur">
      <div className="mx-auto flex min-h-20 max-w-4xl items-center gap-3 px-4 md:px-6">
        <Link
          to="/home"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18] transition-colors hover:bg-[#E5E7EB]"
          aria-label="Back to home"
        >
          <FaArrowLeft className="text-lg" aria-hidden="true" />
        </Link>
        <Link
          to="/home"
          className="flex min-h-11 items-center gap-3 rounded-xl pr-3"
          aria-label="Craves home"
        >
          <CravesLogo size="sm" decorative />
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#6B6B6B]">
              Craves account
            </p>
            <span className="mt-0.5 block text-xl font-semibold text-[#1A1A1A]">
              Profile
            </span>
          </div>
        </Link>
      </div>
      <div className="mx-auto max-w-4xl px-4 pb-4 md:px-6">
        <PersistentCustomerServiceNav />
      </div>
    </header>
  );
}

export default ProfileHeader;
