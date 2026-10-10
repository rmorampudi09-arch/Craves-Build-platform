"use client";

import { chefApiError, chefErrorText } from "@/lib/chef-errors";
import Link from "next/link";
import { useEffect, useState, type ComponentType } from "react";
import {
  ArrowLeftRight,
  BadgeIndianRupee,
  Bell,
  CalendarDays,
  ChevronRight,
  FileCheck2,
  FileText,
  Gauge,
  Images,
  Landmark,
  LifeBuoy,
  LogOut,
  ShieldCheck,
  Store,
  UserRound,
} from "lucide-react";
import { ChefAccessBoundary } from "@/components/chef-access-boundary";
import { switchToCustomerApp, useChefSignOut } from "@/components/chef-account-menu";
import { ChefPageHeader } from "@/components/chef-page-header";

type Application = { firstName:string|null; lastName:string|null; status:string };
type Kitchen = { kitchenName:string };
type Item = { label: string; description: string; icon: ComponentType<{ className?: string }> } & ({ href: string } | { action: "switch" | "sign-out" });

const PROFILE_UNAVAILABLE = "Your profile could not load. Please try again.";
// Buttons need ! because the unlayered theme styles every <button>.
const ROW = "flex min-h-[72px] w-full items-center gap-4 px-5 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-flame-red)] sm:px-6";
const LINK_ROW = `${ROW} hover:bg-[#F1F3F5]`;
const BUTTON_ROW = `${ROW} !rounded-none !border-x-0 !border-t-0 !border-b-[#E5E7EB] last:!border-b-0 !bg-white !shadow-none hover:!bg-[#F1F3F5] disabled:opacity-60`;

/** Every chef page that is not a tab, grouped so none is left without a way in. */
function groups(kitchen: Kitchen | null): { title: string; items: Item[] }[] {
  return [
    { title: "Kitchen", items: [
      { href: "/chef/kitchen", icon: Store, label: "Kitchen details", description: kitchen?.kitchenName || "Name, description and pickup address" },
      { href: "/chef/menu/media", icon: Images, label: "Menu photos", description: "Photos customers see on each dish" },
      { href: "/chef/meal-plans", icon: CalendarDays, label: "Meal plans", description: "Weekly and monthly plans from your dishes" },
      { href: "/chef/capacity", icon: Gauge, label: "Capacity", description: "How many plan meals you can cook" },
      { href: "/chef/operations", icon: ShieldCheck, label: "Operations", description: "Approval, documents and kitchen readiness" },
    ] },
    { title: "Money", items: [
      { href: "/chef/earnings", icon: BadgeIndianRupee, label: "Earnings", description: "What you earned from completed orders" },
      { href: "/chef/finance", icon: Landmark, label: "Finance & payouts", description: "Available balance, bank details and payout requests" },
      { href: "/chef/statements", icon: FileText, label: "Statements", description: "Dated PDF statements of orders and earnings" },
    ] },
    { title: "Account", items: [
      { href: "/chef/application/status", icon: FileCheck2, label: "Your application", description: "Status and the details you submitted" },
      { href: "/chef/notifications", icon: Bell, label: "Notifications", description: "Orders, payments and account updates" },
      { href: "/contact", icon: LifeBuoy, label: "Help", description: "Contact Craves support" },
      { action: "switch", icon: ArrowLeftRight, label: "Switch to customer app", description: "Order food as a customer" },
      { action: "sign-out", icon: LogOut, label: "Sign out", description: "Sign out of Craves on this device" },
    ] },
  ];
}

function RowContent({ item, label }: { item: Item; label: string }) {
  const Icon = item.icon;
  return <>
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] text-[#1A1A1A]"><Icon className="h-5 w-5" aria-hidden="true"/></span>
    <span className="min-w-0 flex-1"><strong className="block text-sm text-[#1A1A1A]">{label}</strong><span className="mt-1 block truncate text-sm text-[#6B6B6B]">{item.description}</span></span>
    {"href" in item ? <ChevronRight className="h-5 w-5 shrink-0 text-[#6B6B6B]" aria-hidden="true"/> : null}
  </>;
}

function MoreHub(){
 const [application,setApplication]=useState<Application|null>(null);
 const [kitchen,setKitchen]=useState<Kitchen|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [retry,setRetry]=useState(0);
 const signOut=useChefSignOut();
 useEffect(()=>{let active=true; setLoading(true); setError(""); void Promise.all([fetch("/api/chef/application",{cache:"no-store"}),fetch("/api/chef/kitchen",{cache:"no-store"})]).then(async([a,k])=>{if(!a.ok) throw chefApiError(a,await a.json().catch(()=>null),PROFILE_UNAVAILABLE);if(!k.ok) throw chefApiError(k,await k.json().catch(()=>null),PROFILE_UNAVAILABLE);const av=await a.json().catch(()=>null);const kv=await k.json().catch(()=>null);if(active){setApplication(av);setKitchen(kv);setLoading(false)}}).catch((cause:unknown)=>{if(active){setError(chefErrorText(cause,PROFILE_UNAVAILABLE));setLoading(false)}});return()=>{active=false}},[retry]);
 const name=[application?.firstName,application?.lastName].filter(Boolean).join(" ")||"Chef";
 return <div className="space-y-6">
   <section className="rounded-3xl border border-[#E5E7EB] bg-white p-5 sm:p-6" aria-busy={loading}>
    {loading ? <div className="h-16 animate-pulse rounded-2xl bg-[#F1F3F5] motion-reduce:animate-none" aria-label="Loading profile"/>
     : error ? <div><p role="alert" className="text-sm text-[#1A1A1A]">{error}</p><button type="button" onClick={()=>setRetry(value=>value+1)} className="craves-primary-action mt-4">Try again</button></div>
     : <div className="flex items-center gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] text-[#1A1A1A]"><UserRound className="h-6 w-6" aria-hidden="true"/></span>
        <div className="min-w-0"><h2 className="truncate text-xl font-bold text-[#1A1A1A]">{name}</h2><p className="mt-1 truncate text-sm text-[#6B6B6B]">{kitchen?.kitchenName||"Your kitchen"} · {application?.status==="APPROVED"?"Verified chef":"Application in progress"}</p></div>
       </div>}
   </section>
   {groups(kitchen).map(group=><section key={group.title} aria-labelledby={`more-${group.title}`}>
    <h2 id={`more-${group.title}`} className="mb-2 px-1 text-sm font-semibold text-[#6B6B6B]">{group.title}</h2>
    <div className="divide-y divide-[#E5E7EB] overflow-hidden rounded-3xl border border-[#E5E7EB] bg-white">
     {group.items.map(item=>"href" in item
      ? <Link key={item.label} href={item.href} className={LINK_ROW}><RowContent item={item} label={item.label}/></Link>
      : <button key={item.label} type="button" className={BUTTON_ROW} disabled={item.action==="sign-out"&&signOut.busy} onClick={()=>item.action==="switch"?switchToCustomerApp():void signOut.signOut()}><RowContent item={item} label={item.action==="sign-out"&&signOut.busy?"Signing out…":item.label}/></button>)}
    </div>
   </section>)}
   {signOut.error?<p role="alert" className="text-sm font-medium text-[#C4200F]">{signOut.error}</p>:null}
 </div>;
}

export default function ChefMorePage(){
 return <main className="mx-auto min-h-screen max-w-4xl px-4 py-6 md:px-6 md:py-8"><ChefAccessBoundary><ChefPageHeader eyebrow="Chef Mode" title="More" description="Your kitchen, money and account in one place."/><div className="mt-6"><MoreHub/></div></ChefAccessBoundary></main>;
}
