import type { ReactNode } from "react";
import { ChefAppHeader } from "@/components/chef-app-header";
import { ChefWorkspaceNavigation } from "@/components/chef-workspace-navigation";
import "./chef-mode.css";

export default function ChefLayout({children}:{children:ReactNode}) {
 return <div className="chef-panel-theme min-h-screen">
  <ChefAppHeader/>
  <div className="chef-panel-content">{children}</div>
  <ChefWorkspaceNavigation placement="bottom"/>
 </div>;
}
