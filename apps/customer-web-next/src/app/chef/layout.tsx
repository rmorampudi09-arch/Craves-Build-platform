import type { ReactNode } from "react";
import { ChefAppHeader } from "@/components/chef-app-header";
import { ChefWorkspaceNavigation } from "@/components/chef-workspace-navigation";
import { ChefOrderWatcher } from "@/components/chef-order-watcher";
import "./chef-mode.css";

export default function ChefLayout({children}:{children:ReactNode}) {
 return <div className="chef-panel-theme min-h-screen">
  <a href="#chef-content" className="chef-skip-link">Skip to content</a>
  <ChefAppHeader/>
  <div id="chef-content" tabIndex={-1} className="chef-panel-content">{children}</div>
  <ChefWorkspaceNavigation placement="bottom"/>
  <ChefOrderWatcher/>
 </div>;
}
