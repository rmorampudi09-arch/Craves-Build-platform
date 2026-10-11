import type { ReactNode } from "react";
import { ChefPageHead } from "@/components/chef-ui";

/**
 * Title block for Chef Mode pages. `eyebrow` is accepted for older callers but not shown:
 * the title carries the page on its own.
 */
export function ChefPageHeader({
  title,
  description,
  action,
  back,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  back?: { href: string; label: string };
}) {
  return <ChefPageHead title={title} subtitle={description} action={action} back={back} />;
}
export default ChefPageHeader;
