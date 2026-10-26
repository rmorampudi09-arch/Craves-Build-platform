"use client";

import { Link } from "@tanstack/react-router";
import { Bell, Settings } from "lucide-react";
import { FaArrowLeft } from "react-icons/fa6";

import { CravesLogo } from "@/shared/components/brand/CravesLogo";
import { AutoHideCustomerHeader } from "@/shared/components/navigation/AutoHideCustomerHeader";
import { notificationsLabel, UnreadBadge, useCustomerUnreadCount } from "@/shared/components/notifications/unread-badge";

const ICON_LINK =
  "relative flex h-11 w-11 items-center justify-center rounded-full transition-[background-color,box-shadow] hover:shadow-[0_6px_16px_rgba(26,26,26,0.08)]";

/** `signedIn` turns on the bell's unread count once the account is known. */
export function ProfileHeader({ signedIn = false }: { signedIn?: boolean }) {
  const unread = useCustomerUnreadCount(signedIn);
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
          <h1 className="mt-0.5 text-lg font-black tracking-[-0.02em] text-[#1A1A1A] md:text-xl">
            Profile
          </h1>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Link
            to="/notifications"
            className={`${ICON_LINK} bg-[#FDEAE8] text-[#D92714] hover:bg-white`}
            aria-label={notificationsLabel(unread)}
          >
            <Bell className="h-5 w-5" aria-hidden="true" />
            <UnreadBadge count={unread} />
          </Link>
          <Link to="/settings" className={`${ICON_LINK} bg-[#F1F3F5] text-[#1A1A1A] hover:bg-white`} aria-label="Settings">
            <Settings className="h-5 w-5" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </AutoHideCustomerHeader>
  );
}

export default ProfileHeader;
