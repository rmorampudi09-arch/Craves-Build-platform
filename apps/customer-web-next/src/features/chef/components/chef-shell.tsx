import type { ReactNode } from "react";
import { ChefAppHeader } from "@/features/chef/components/chef-app-header";
import { ChefWorkspaceNavigation } from "@/features/chef/components/chef-workspace-navigation";
import { ChefOrderWatcher } from "@/features/chef/components/chef-order-watcher";
import type { Language } from "@/shared/i18n/language";
import { LanguageProvider } from "@/shared/i18n/language-context";

/** Every chef page: header, content, tab bar and the order watcher, in the chef's language. */
export function ChefShell({ language, chosen, children }: { language: Language; chosen: boolean; children?: ReactNode }) {
  return (
    <LanguageProvider initial={language} chosen={chosen}>
      <div className="chef-panel-theme min-h-screen" lang={language}>
        <ChefAppHeader/>
        <div id="chef-content" tabIndex={-1} className="chef-panel-content">{children}</div>
        <ChefWorkspaceNavigation placement="bottom"/>
        <ChefOrderWatcher/>
      </div>
    </LanguageProvider>
  );
}
