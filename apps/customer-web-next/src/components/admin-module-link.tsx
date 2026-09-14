import Link from "next/link";
import type { ReactNode } from "react";
import type { AdminModule } from "@/lib/admin-navigation";

/** Delivery Intelligence is a separate Next.js app: do not use an RSC navigation. */
export function AdminModuleLink({ module, children, className, current, onNavigate }: {
  module: AdminModule;
  children: ReactNode;
  className?: string;
  current?: boolean;
  onNavigate?: () => void;
}) {
  const props = { className, onClick: onNavigate, "aria-current": current ? "page" as const : undefined };
  return module.externalApp
    ? <a href={module.href} {...props}>{children}</a>
    : <Link href={module.href} prefetch={false} {...props}>{children}</Link>;
}
