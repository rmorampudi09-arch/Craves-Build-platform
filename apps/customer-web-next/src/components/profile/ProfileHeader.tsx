import { Link } from "@tanstack/react-router";
import { FaArrowLeft } from "react-icons/fa6";
import { CravesLogo } from "@/components/brand/CravesLogo";
import { AutoHideCustomerHeader } from "@/components/navigation/AutoHideCustomerHeader";

export function ProfileHeader() {
  return (
    <AutoHideCustomerHeader className="border-b border-[#E5E7EB] bg-white/95 shadow-[0_4px_18px_rgba(26,26,26,0.04)] backdrop-blur-xl">
      <div className="relative mx-auto flex max-w-4xl items-start justify-center px-4 pb-5 pt-6 md:px-6 md:pb-6 md:pt-8">
        <Link
          to="/home"
          className="absolute left-4 top-6 flex h-11 w-11 items-center justify-center rounded-full !bg-white !text-[#1A1A1A] transition-colors hover:!bg-[#F1F3F5] md:left-6 md:top-8"
          aria-label="Back to home"
        >
          <FaArrowLeft className="text-lg" aria-hidden="true" />
        </Link>

        <Link
          to="/home"
          className="flex flex-col items-center rounded-xl text-center"
          aria-label="Craves home"
        >
          <CravesLogo size="sm" decorative />
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#F62E18]">
            Craves account
          </p>
          <span className="mt-1 block text-3xl font-semibold leading-tight text-[#1A1A1A]">
            Profile
          </span>
        </Link>
      </div>
    </AutoHideCustomerHeader>
  );
}

export default ProfileHeader;
