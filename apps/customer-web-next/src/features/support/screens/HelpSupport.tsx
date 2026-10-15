import { Link } from "@tanstack/react-router";
import { ArrowLeft, ChevronRight, Mail, MessageCircle, Phone } from "lucide-react";
import type { ComponentType } from "react";

import {
  CRAVES_SUPPORT_EMAIL,
  CRAVES_SUPPORT_PHONE,
  CRAVES_SUPPORT_PHONE_LABEL,
  SUPPORT_COMMON_QUESTIONS,
} from "@/features/support/lib/support-contact";
import { AutoHideCustomerHeader } from "@/shared/components/navigation/AutoHideCustomerHeader";

const TILE =
  "flex h-28 min-w-0 flex-1 flex-col items-center justify-center gap-2 rounded-2xl text-sm font-black transition-[border-color,box-shadow,background-color] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A1A1A]/30";

function TileBody({ icon: Icon, label, hint, filled = false }: { icon: ComponentType<{ className?: string }>; label: string; hint: string; filled?: boolean }) {
  return (
    <>
      <span className={`flex h-11 w-11 items-center justify-center rounded-full ${filled ? "bg-white/20 text-white" : "bg-[#F1F3F5] text-[#F62E18]"}`}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      {label}
      <span className="sr-only">: {hint}</span>
    </>
  );
}

/** Help & support: chat, call or email Craves, and shortcuts for the common questions (as in the app). */
export function HelpSupport() {
  const outlined = `${TILE} border border-[#E5E7EB] bg-white text-[#1A1A1A] hover:border-[#D7DADF] hover:shadow-[0_8px_22px_rgba(26,26,26,0.07)]`;
  return (
    <div className="min-h-screen bg-white pb-12 text-[#1A1A1A]">
      <AutoHideCustomerHeader className="border-b border-[#E5E7EB] bg-white/95 shadow-[0_4px_18px_rgba(26,26,26,0.04)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-4 md:px-6">
          <Link
            to="/profile"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] text-[#1A1A1A] transition-colors hover:text-[#F62E18]"
            aria-label="Back to profile"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </Link>
          <h1 className="font-display text-xl font-black tracking-[-0.03em]">Help & support</h1>
        </div>
      </AutoHideCustomerHeader>

      <main className="mx-auto max-w-2xl px-4 py-5 md:px-6">
        <p className="px-1 text-sm text-[#6B6B6B]">How would you like to reach Craves?</p>
        <div className="mt-4 flex gap-2.5">
          <Link to="/support" className={`${TILE} bg-[#C4200F] text-white hover:bg-[#A81B0C]`}>
            <TileBody filled icon={MessageCircle} label="Chat" hint="chat with the Craves assistant about orders, payments, refunds or your account" />
          </Link>
          <a href={`tel:${CRAVES_SUPPORT_PHONE}`} className={outlined}>
            <TileBody icon={Phone} label="Call" hint={`call Craves support on ${CRAVES_SUPPORT_PHONE_LABEL}`} />
          </a>
          <a href={`mailto:${CRAVES_SUPPORT_EMAIL}?subject=Craves%20support`} className={outlined}>
            <TileBody icon={Mail} label="Email" hint={`email ${CRAVES_SUPPORT_EMAIL}`} />
          </a>
        </div>
        <p className="mt-2.5 px-1 text-xs leading-5 text-[#6B6B6B]">
          Chat replies in seconds. Call {CRAVES_SUPPORT_PHONE_LABEL}. Email {CRAVES_SUPPORT_EMAIL}.
        </p>

        <h2 className="mb-2 mt-8 px-1 font-display text-lg font-black">Common questions</h2>
        <ul className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white">
          {SUPPORT_COMMON_QUESTIONS.map((question, index) => (
            <li key={question.label} className={index > 0 ? "border-t border-[#F1F3F5]" : undefined}>
              <Link
                to={question.href}
                className="flex min-h-14 items-center gap-3 px-4 py-3 text-sm font-semibold transition-colors hover:bg-[#F8F9FA] focus-visible:bg-[#F8F9FA] focus-visible:outline-none"
              >
                <span className="min-w-0 flex-1">{question.label}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-[#A2A6AA]" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
