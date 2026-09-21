"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, ClipboardList, Home, User } from "lucide-react";

type CustomerNavItem = {
  href: string;
  label: string;
  icon: typeof Home;
};

function CustomerBottomNav({ allScreens = false }: { allScreens?: boolean }) {
  const pathname = usePathname();
  const onHome = pathname === "/home";

  const items: CustomerNavItem[] = [
    onHome
      ? { href: "/subscriptions", label: "Meal plans", icon: CalendarDays }
      : { href: "/home", label: "Home", icon: Home },
    { href: "/orders", label: "Orders", icon: ClipboardList },
    { href: "/profile", label: "Profile", icon: User },
  ];

  return (
    <nav
      className={[
        "fixed inset-x-0 bottom-0 z-40 border-t border-[#E5E7EB] bg-white/95 shadow-[0_-6px_24px_rgba(26,26,26,0.06)] backdrop-blur-xl",
        allScreens ? "" : "md:hidden",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label="Customer navigation"
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-around px-2 pb-[max(0.45rem,env(safe-area-inset-bottom))] pt-1.5">
        {items.map(({ href, label, icon: Icon }) => {
          const active =
            pathname === href ||
            (href !== "/home" && pathname.startsWith(href + "/"));

          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className={[
                  "flex min-h-[3.35rem] flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[0.66rem] font-extrabold transition-colors",
                  active
                    ? "text-[#F62E18]"
                    : "text-[#6B6B6B] hover:text-[#1A1A1A]",
                ].join(" ")}
                aria-current={active ? "page" : undefined}
              >
                <Icon
                  className={[
                    "h-[1.15rem] w-[1.15rem]",
                    active ? "stroke-[2.4]" : "stroke-[2]",
                  ].join(" ")}
                  aria-hidden="true"
                />
                <span className="whitespace-nowrap">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function BottomNav() {
  return <CustomerBottomNav />;
}

export function BottomNavAll() {
  return <CustomerBottomNav allScreens />;
}
