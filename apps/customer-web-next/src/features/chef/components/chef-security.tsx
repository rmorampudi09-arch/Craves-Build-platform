"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { ChevronRight, KeyRound, Mail, Phone, Trash2 } from "lucide-react";
import { ChefPill, ChefSection } from "@/features/chef/components/chef-ui";
import { maskEmail, maskPhone } from "@/features/chef/lib/chef-security";
import { getSession, subscribeSession } from "@/features/auth/api/cravesAuth";
import { format, messages } from "@/shared/i18n/language";
import { useText } from "@/shared/i18n/language-context";
import { ChangePasswordSheet, useHasPassword } from "@/shared/ui/forms/change-password-sheet";

const TEXT = messages({
  en: {
    mobile: "Mobile number", usedToLogIn: "{phone} · used to log in", verified: "Verified", email: "Email",
    verifyEmail: "Verify your email", addEmail: "Add your email", notAdded: "Not added", notVerified: "Not verified",
    changePassword: "Change password", newPassword: "Choose a new password",
    deleteAccount: "Delete my account", deleteNote: "Asks Craves support to close your account",
    changeMobile: "To change your mobile number, contact support.",
    noPassword: " You log in with a one-time code, so there's no password to manage.",
  },
  te: {
    mobile: "మొబైల్ నంబర్", usedToLogIn: "{phone} · లాగిన్ కోసం వాడతారు", verified: "ధృవీకరించబడింది", email: "ఈమెయిల్",
    verifyEmail: "మీ ఈమెయిల్ ధృవీకరించండి", addEmail: "మీ ఈమెయిల్ జోడించండి", notAdded: "జోడించలేదు", notVerified: "ధృవీకరించలేదు",
    changePassword: "పాస్‌వర్డ్ మార్చండి", newPassword: "కొత్త పాస్‌వర్డ్ ఎంచుకోండి",
    deleteAccount: "నా ఖాతా తొలగించండి", deleteNote: "మీ ఖాతా మూసివేయమని Craves సహాయ బృందాన్ని అడుగుతుంది",
    changeMobile: "మీ మొబైల్ నంబర్ మార్చాలంటే సహాయ బృందాన్ని సంప్రదించండి.",
    noPassword: " మీరు OTP తో లాగిన్ అవుతారు, కాబట్టి పాస్‌వర్డ్ అవసరం లేదు.",
  },
  kn: {
    mobile: "ಮೊಬೈಲ್ ಸಂಖ್ಯೆ", usedToLogIn: "{phone} · ಲಾಗಿನ್‌ಗೆ ಬಳಸಲಾಗುತ್ತದೆ", verified: "ಪರಿಶೀಲಿಸಲಾಗಿದೆ", email: "ಇಮೇಲ್",
    verifyEmail: "ನಿಮ್ಮ ಇಮೇಲ್ ಪರಿಶೀಲಿಸಿ", addEmail: "ನಿಮ್ಮ ಇಮೇಲ್ ಸೇರಿಸಿ", notAdded: "ಸೇರಿಸಿಲ್ಲ", notVerified: "ಪರಿಶೀಲಿಸಿಲ್ಲ",
    changePassword: "ಪಾಸ್‌ವರ್ಡ್ ಬದಲಾಯಿಸಿ", newPassword: "ಹೊಸ ಪಾಸ್‌ವರ್ಡ್ ಆಯ್ಕೆಮಾಡಿ",
    deleteAccount: "ನನ್ನ ಖಾತೆ ಅಳಿಸಿ", deleteNote: "ನಿಮ್ಮ ಖಾತೆ ಮುಚ್ಚಲು Craves ಸಹಾಯ ತಂಡವನ್ನು ಕೇಳುತ್ತದೆ",
    changeMobile: "ನಿಮ್ಮ ಮೊಬೈಲ್ ಸಂಖ್ಯೆ ಬದಲಾಯಿಸಲು ಸಹಾಯ ತಂಡವನ್ನು ಸಂಪರ್ಕಿಸಿ.",
    noPassword: " ನೀವು OTP ಮೂಲಕ ಲಾಗಿನ್ ಆಗುತ್ತೀರಿ, ಆದ್ದರಿಂದ ಪಾಸ್‌ವರ್ಡ್ ಬೇಕಿಲ್ಲ.",
  },
});

/** Login & security: what the chef logs in with, Change password for email accounts, and asking Craves to delete the account. */
export function ChefSecurity() {
  const text = useText(TEXT);
  const user = useSyncExternalStore(subscribeSession, getSession, () => null);
  const email = user?.email?.trim();
  const verified = Boolean(email && user?.emailVerified);
  const hasPassword = useHasPassword(user?.phoneNumber);
  const [changingPassword, setChangingPassword] = useState(false);
  return (
    <div className="chef-stack">
      <ChefSection flush>
        <div className="chef-list">
          <div className="chef-row">
            <span className="chef-row-icon"><Phone className="h-5 w-5" aria-hidden="true" /></span>
            <span className="chef-row-main">
              <span className="chef-row-title block">{text.mobile}</span>
              <span className="chef-row-meta block">{user ? format(text.usedToLogIn, { phone: maskPhone(user.phoneNumber) }) : "—"}</span>
            </span>
            <ChefPill tone="success">{text.verified}</ChefPill>
          </div>
          <div className="chef-row">
            <span className="chef-row-icon"><Mail className="h-5 w-5" aria-hidden="true" /></span>
            <span className="chef-row-main">
              <span className="chef-row-title block">{text.email}</span>
              {email ? <span className="chef-row-meta block">{maskEmail(email)}</span> : null}
              {/* Email is verified on Balance & payouts, where payouts need it. */}
              {verified ? null : <Link href="/chef/finance" className="chef-btn is-small mt-2">{email ? text.verifyEmail : text.addEmail}</Link>}
            </span>
            <ChefPill tone={verified ? "success" : "muted"}>{!email ? text.notAdded : verified ? text.verified : text.notVerified}</ChefPill>
          </div>
        </div>
      </ChefSection>
      <ChefSection flush>
        <div className="chef-list">
          {hasPassword ? (
            <button type="button" className="chef-row w-full !rounded-none !border-0 !bg-transparent !shadow-none text-left" onClick={() => setChangingPassword(true)}>
              <span className="chef-row-icon"><KeyRound className="h-5 w-5" aria-hidden="true" /></span>
              <span className="chef-row-main">
                <span className="chef-row-title block">{text.changePassword}</span>
                <span className="chef-row-meta block">{text.newPassword}</span>
              </span>
              <ChevronRight className="chef-chevron h-5 w-5" aria-hidden="true" />
            </button>
          ) : null}
          <Link href={`/chef/support/new?topic=${encodeURIComponent("Delete my account")}&from=/chef/security`} className="chef-row">
            <span className="chef-row-icon"><Trash2 className="h-5 w-5 text-[#C4200F]" aria-hidden="true" /></span>
            <span className="chef-row-main">
              <span className="chef-row-title block !text-[#C4200F]">{text.deleteAccount}</span>
              <span className="chef-row-meta block">{text.deleteNote}</span>
            </span>
            <ChevronRight className="chef-chevron h-5 w-5" aria-hidden="true" />
          </Link>
        </div>
      </ChefSection>
      <p className="px-1 text-[0.875rem] leading-6 text-[#6B6B6B]">
        {text.changeMobile}
        {hasPassword === false ? text.noPassword : null}
      </p>
      <ChangePasswordSheet
        open={changingPassword}
        onClose={() => setChangingPassword(false)}
        phoneNumber={user?.phoneNumber ?? ""}
        bodyClassName="chef-panel-theme chef-sheet-theme"
      />
    </div>
  );
}
