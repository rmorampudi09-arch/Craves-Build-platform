"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { BellRing, ChevronRight } from "lucide-react";
import { isChefModeVerified } from "@/features/chef/lib/chef-mode";
import { isAwaitingAnswer, orderWords, useChefOrderPolling } from "@/features/chef/lib/chef-order-alert";
import type { ChefOrder } from "@/features/chef/lib/chef-order-contract";
import { shortOrderNumber } from "@/shared/lib/order-number";
import { getSession, subscribeSession } from "@/features/auth/api/cravesAuth";
import { format, messages } from "@/shared/i18n/language";
import { useLanguage, useText } from "@/shared/i18n/language-context";

const TEXT = messages({
  en: { newOrder: "New order {number}", newOrderAndMore: "New order {number}, and {count} more", waitingOne: "New order waiting", waitingMany: "{count} new orders waiting", answerNow: "Answer now" },
  te: { newOrder: "కొత్త ఆర్డర్ {number}", newOrderAndMore: "కొత్త ఆర్డర్ {number}, మరో {count} కూడా", waitingOne: "కొత్త ఆర్డర్ ఎదురుచూస్తోంది", waitingMany: "{count} కొత్త ఆర్డర్లు ఎదురుచూస్తున్నాయి", answerNow: "ఇప్పుడే జవాబు ఇవ్వండి" },
  kn: { newOrder: "ಹೊಸ ಆರ್ಡರ್ {number}", newOrderAndMore: "ಹೊಸ ಆರ್ಡರ್ {number}, ಇನ್ನೂ {count} ಕೂಡ", waitingOne: "ಹೊಸ ಆರ್ಡರ್ ಕಾಯುತ್ತಿದೆ", waitingMany: "{count} ಹೊಸ ಆರ್ಡರ್‌ಗಳು ಕಾಯುತ್ತಿವೆ", answerNow: "ಈಗಲೇ ಉತ್ತರಿಸಿ" },
});

const waitingOrders = (orders: ChefOrder[]) => orders.filter(isAwaitingAnswer);

/**
 * On every chef page: says a new order out loud to screen readers, and on pages that don't
 * list orders (Menu, Earnings, More, another order…) shows an "Answer now" bar.
 */
export function ChefOrderWatcher() {
  const pathname = usePathname();
  const user = useSyncExternalStore(subscribeSession, getSession, () => null);
  const chef = Boolean(user?.roles.some((role) => role.toUpperCase() === "CHEF")) && isChefModeVerified(user?.id);
  const enabled = chef && pathname !== "/chef/sign-in" && !pathname.startsWith("/chef/application");
  // Home and Orders show waiting orders as cards and load the list themselves.
  const listsOrders = pathname === "/chef" || pathname === "/chef/orders";
  const [waiting, setWaiting] = useState<ChefOrder[]>([]);
  const [announcement, setAnnouncement] = useState("");
  const text = useText(TEXT);
  const { language } = useLanguage();

  useChefOrderPolling(
    enabled,
    (orders, fresh) => {
      setWaiting(waitingOrders(orders));
      if (fresh.length > 0) {
        const intro = format(fresh.length > 1 ? text.newOrderAndMore : text.newOrder, { number: shortOrderNumber(fresh[0]!.id), count: fresh.length - 1 });
        setAnnouncement(orderWords(fresh[0]!, intro, language));
      }
    },
    { checkNow: !listsOrders },
  );

  if (!enabled) return null;
  // On an order's own page, only other waiting orders need the bar.
  const others = listsOrders ? [] : waiting.filter((order) => !pathname.endsWith(order.id));
  const only = others.length === 1 ? others[0] : null;
  return (
    <>
      <p className="sr-only" role="status">{announcement}</p>
      {others.length > 0 ? (
        <div className="chef-order-banner-wrap">
          <Link href={only ? `/chef/orders/${only.id}` : "/chef"} className="chef-order-banner">
            <BellRing className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span className="min-w-0">{only ? text.waitingOne : format(text.waitingMany, { count: others.length })}</span>
            <span className="chef-order-banner-cta">
              {text.answerNow}
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </span>
          </Link>
        </div>
      ) : null}
    </>
  );
}
