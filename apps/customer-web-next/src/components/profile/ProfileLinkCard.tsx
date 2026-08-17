import { Link } from "@tanstack/react-router";
import { FaChevronRight } from "react-icons/fa6";
import type { IconType } from "react-icons";

import { rememberReturnRoute } from "@/lib/return-navigation";

interface ProfileLinkCardProps {
  to: string;
  icon: IconType;
  title: string;
  subtitle: string;
}

export function ProfileLinkCard({
  to,
  icon: Icon,
  title,
  subtitle,
}: ProfileLinkCardProps) {
  return (
    <Link
      to={to}
      onClick={() => rememberReturnRoute(to, "/profile")}
      className="group flex min-h-[88px] items-center justify-between gap-4 rounded-2xl border border-[#D8DADD] bg-white p-4 shadow-[0_3px_10px_rgba(0,0,0,0.07)] transition-[border-color,box-shadow] duration-200 hover:border-[#C9CCD0] hover:shadow-[0_4px_14px_rgba(0,0,0,0.09)] focus-visible:border-[#C9CCD0]"
    >
      <div className="flex min-w-0 items-center gap-3.5">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]">
          <Icon className="text-[22px]" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-[#1A1A1A]">{title}</h2>
          <p className="mt-1 text-sm leading-5 text-[#6B6B6B]">{subtitle}</p>
        </div>
      </div>
      <FaChevronRight
        className="shrink-0 text-sm text-[#1A1A1A] transition-transform group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </Link>
  );
}

export default ProfileLinkCard;
