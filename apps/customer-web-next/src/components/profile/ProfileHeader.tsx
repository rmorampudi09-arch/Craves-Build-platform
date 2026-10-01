import { Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { FaArrowLeft } from "react-icons/fa6";

import { CravesLogo } from "@/components/brand/CravesLogo";
import { AutoHideCustomerHeader } from "@/components/navigation/AutoHideCustomerHeader";

export function ProfileHeader() {
  return (
    <AutoHideCustomerHeader className="border-b border-[#E5E7EB] bg-white/95 shadow-[0_4px_18px_rgba(26,26,26,0.04)] backdrop-blur-xl">
      <div className="mx-auto flex min-h-[3.9rem] max-w-5xl items-center gap-3 px-4 py-2.5 md:min-h-[4.4rem] md:px-6">
        <Link
          to="/home"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full !bg-[#F1F3F5] !text-[#1A1A1A] transition-colors hover:!text-[#F62E18]"
          aria-label="Back to home"
        >
          <FaArrowLeft className="text-sm" aria-hidden="true" />
        </Link>

        <Link
          to="/home"
          className="hidden shrink-0 items-center rounded-xl md:flex"
          aria-label="Craves home"
        >
          <CravesLogo size="sm" decorative />
        </Link>

        <div className="min-w-0">
          <p className="text-[0.58rem] font-black uppercase tracking-[0.14em] text-[#F62E18]">
            Craves account
          </p>
          <h1 className="mt-0.5 text-lg font-black tracking-[-0.02em] text-[#1A1A1A] md:text-xl">
            Profile
          </h1>
        </div>

        <Link
          to="/notifications"
          className="ml-auto flex h-10 w-10 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18] transition-[background-color,box-shadow] hover:bg-white hover:shadow-[0_6px_16px_rgba(26,26,26,0.08)]"
          aria-label="Open notifications"
          title="Notifications"
        >
          <Bell className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </AutoHideCustomerHeader>
  );
}

export default ProfileHeader;
