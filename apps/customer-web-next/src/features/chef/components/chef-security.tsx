"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { ChevronRight, Mail, Phone, Trash2 } from "lucide-react";
import { ChefPill, ChefSection } from "@/features/chef/components/chef-ui";
import { maskEmail, maskPhone } from "@/features/chef/lib/chef-security";
import { getSession, subscribeSession } from "@/features/auth/api/cravesAuth";

/** Login & security: what the chef logs in with, and asking Craves to delete the account. */
export function ChefSecurity() {
  const user = useSyncExternalStore(subscribeSession, getSession, () => null);
  const email = user?.email?.trim();
  const verified = Boolean(email && user?.emailVerified);
  return (
    <div className="chef-stack">
      <ChefSection flush>
        <div className="chef-list">
          <div className="chef-row">
            <span className="chef-row-icon"><Phone className="h-5 w-5" aria-hidden="true" /></span>
            <span className="chef-row-main">
              <span className="chef-row-title block">Mobile number</span>
              <span className="chef-row-meta block">{user ? `${maskPhone(user.phoneNumber)} · used to log in` : "—"}</span>
            </span>
            <ChefPill tone="success">Verified</ChefPill>
          </div>
          <div className="chef-row">
            <span className="chef-row-icon"><Mail className="h-5 w-5" aria-hidden="true" /></span>
            <span className="chef-row-main">
              <span className="chef-row-title block">Email</span>
              {email ? <span className="chef-row-meta block">{maskEmail(email)}</span> : null}
              {/* Email is verified on Balance & payouts, where payouts need it. */}
              {verified ? null : <Link href="/chef/finance" className="chef-btn is-small mt-2">{email ? "Verify your email" : "Add your email"}</Link>}
            </span>
            <ChefPill tone={verified ? "success" : "muted"}>{!email ? "Not added" : verified ? "Verified" : "Not verified"}</ChefPill>
          </div>
        </div>
      </ChefSection>
      <ChefSection flush>
        <Link href={`/chef/support/new?topic=${encodeURIComponent("Delete my account")}`} className="chef-row">
          <span className="chef-row-icon"><Trash2 className="h-5 w-5 text-[#C4200F]" aria-hidden="true" /></span>
          <span className="chef-row-main">
            <span className="chef-row-title block !text-[#C4200F]">Delete my account</span>
            <span className="chef-row-meta block">Asks Craves support to close your account</span>
          </span>
          <ChevronRight className="chef-chevron h-5 w-5" aria-hidden="true" />
        </Link>
      </ChefSection>
      <p className="px-1 text-[0.875rem] leading-6 text-[#6B6B6B]">
        To change your mobile number, contact support. You log in with a one-time code, so there&apos;s no password to manage.
      </p>
    </div>
  );
}
