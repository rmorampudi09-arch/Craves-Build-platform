import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AdminExplorerSession } from "@/components/admin-explorer-session";
import { AdminWorkspace } from "@/components/admin-workspace";

export const metadata: Metadata = {
  title: "Craves administration",
  robots: { index: false, follow: false }
};

export default function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <AdminWorkspace><AdminExplorerSession>{children}</AdminExplorerSession></AdminWorkspace>;
}
