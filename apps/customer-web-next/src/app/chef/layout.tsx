import type { ReactNode } from "react";
import { ChefShell } from "@/features/chef/components/chef-shell";
import { requestLanguage } from "@/shared/i18n/server-language";
import "../../features/chef/styles/chef-mode.css";

export default async function ChefLayout({ children }: { children: ReactNode }) {
  // The chef's language comes from a cookie, so the first screen is already in it.
  const saved = await requestLanguage();
  return <ChefShell language={saved ?? "en"} chosen={saved !== null}>{children}</ChefShell>;
}
