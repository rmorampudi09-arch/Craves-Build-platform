"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { currentAdminTab } from "@/features/admin/shell/lib/admin-navigation";

/**
 * A page's own header. On a tab page the workspace already shows the area, what the page is for and the tabs,
 * so only the page's actions are drawn here; a detail page (one rider, one application, one case) gets its own title.
 */
export function AdminPageIntro({ title, description, children }: {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  const place = currentAdminTab(usePathname());
  if (place && !place.detail) return children ? <div className="ad-intro-actions">{children}</div> : null;
  return <header className="ad-ph ad-detail-head">
    <div><h1>{title}</h1><p>{description}</p></div>
    {children && <div className="ad-intro-actions">{children}</div>}
  </header>;
}
