"use client";

import { useRouter } from "next/navigation";
import { ChefUnderlineTabs } from "@/features/chef/components/chef-ui";
import { messages } from "@/shared/i18n/language";
import { useText } from "@/shared/i18n/language-context";

const TEXT = messages({
  en: { dishes: "Dishes", plans: "Meal plans", views: "Menu" },
  te: { dishes: "వంటకాలు", plans: "మీల్ ప్లాన్‌లు", views: "మెనూ" },
  kn: { dishes: "ಖಾದ್ಯಗಳು", plans: "ಮೀಲ್ ಪ್ಲಾನ್‌ಗಳು", views: "ಮೆನು" },
});

const HREF = { dishes: "/chef/menu", plans: "/chef/menu?view=plans" } as const;

/** The Menu tab's Dishes / Meal plans toggle as the app's red underline tabs: `Dishes 16` once the count is known. */
export function ChefMenuViews({
  current,
  counts,
}: {
  current: "dishes" | "plans";
  counts: { dishes?: number; plans?: number };
}) {
  const text = useText(TEXT);
  const router = useRouter();
  return (
    <ChefUnderlineTabs
      label={text.views}
      tabs={(["dishes", "plans"] as const).map((view) => ({ value: view, label: text[view], count: counts[view] }))}
      value={current}
      onChange={(view) => {
        if (view !== current) router.push(HREF[view]);
      }}
    />
  );
}
