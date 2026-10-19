"use client";

import type { ReactNode } from "react";
import { ChefPageHead } from "@/features/chef/components/chef-ui";
import { pageText } from "@/features/chef/lib/chef-page-text";
import { useLanguage } from "@/shared/i18n/language-context";

/**
 * Title block for Chef Mode pages. Pages pass English words (they stay server components);
 * the header shows them in the chef's language. `eyebrow` is accepted for older callers but not shown.
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
  const { language } = useLanguage();
  return (
    <ChefPageHead
      title={pageText(title, language)}
      subtitle={description ? pageText(description, language) : undefined}
      action={action}
      back={back ? { href: back.href, label: pageText(back.label, language) } : undefined}
    />
  );
}
export default ChefPageHeader;
