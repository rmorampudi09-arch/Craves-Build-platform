import type { ReactNode } from "react";
import { ChefAppHeader } from "@/features/chef/components/chef-app-header";
import { ChefWorkspaceNavigation } from "@/features/chef/components/chef-workspace-navigation";
import { ChefOrderWatcher } from "@/features/chef/components/chef-order-watcher";
import "../../features/chef/styles/chef-mode.css";

export default function ChefLayout({children}:{children:ReactNode}) {
 return <div className="chef-panel-theme min-h-screen">
  <a href="#chef-content" className="chef-skip-link">Skip to content</a>
  <ChefAppHeader/>
  <div id="chef-content" tabIndex={-1} className="chef-panel-content">{children}</div>
  <ChefWorkspaceNavigation placement="bottom"/>
  <ChefOrderWatcher/>
 </div>;
}
