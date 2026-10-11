"use client";

import { chefApiError, chefErrorText } from "@/features/chef/lib/chef-errors";
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
  Landmark,
  LifeBuoy,
  LogOut,
  ShieldCheck,
  Store,
  UserRound,
} from "lucide-react";
import { ChefAccessBoundary } from "@/features/chef/components/chef-access-boundary";
import { switchToCustomerApp, useChefSignOut } from "@/components/chef-account-menu";
import { ChefPageHeader } from "@/features/chef/components/chef-page-header";
import { ChefPill, ChefSkeleton } from "@/components/chef-ui";

type Application = { firstName:string|null; lastName:string|null; status:string };
type Kitchen = { kitchenName:string };
type Item = { label: string; description: string; icon: ComponentType<{ className?: string }> } & ({ href: string } | { action: "switch" | "sign-out" });

const PROFILE_UNAVAILABLE = "Your profile could not load. Please try again.";
const BUTTON_ROW = "chef-row !rounded-none !border-0 !bg-transparent disabled:opacity-60";

/** Every chef page that is not a tab, grouped so none is left without a way in. */
function groups(kitchen: Kitchen | null): { title: string; items: Item[] }[] {
  return [
    { title: "Kitchen", items: [
      { href: "/chef/kitchen", icon: Store, label: "Kitchen details", description: kitchen?.kitchenName || "Name, address and phone" },
      { href: "/chef/operations", icon: ShieldCheck, label: "Can customers find you?", description: "See what’s done and what’s left" },
      { href: "/chef/meal-plans", icon: CalendarDays, label: "Meal plans", description: "Plans customers buy for a week or month" },
      { href: "/chef/capacity", icon: Gauge, label: "Plates per day", description: "How many meal plan plates you can cook" },
    ] },
    { title: "Money", items: [
      { href: "/chef/earnings", icon: BadgeIndianRupee, label: "Earnings", description: "Money from your orders" },
      { href: "/chef/finance", icon: Landmark, label: "Balance & payouts", description: "Take out money, and your bank account" },
      { href: "/chef/statements", icon: FileText, label: "Statements", description: "PDF records to keep or share" },
    ] },
    { title: "Account", items: [
      { href: "/chef/application/status", icon: FileCheck2, label: "Your application", description: "What you sent to Craves" },
      { href: "/chef/notifications", icon: Bell, label: "Notifications", description: "Messages from Craves" },
      { href: "/chef/support", icon: LifeBuoy, label: "Get help", description: "Talk to Craves about an order or money" },
      { action: "switch", icon: ArrowLeftRight, label: "Switch to customer app", description: "Order food for yourself" },
      { action: "sign-out", icon: LogOut, label: "Sign out", description: "Sign out on this phone" },
    ] },
  ];
}

function RowContent({ item, label }: { item: Item; label: string }) {
  const Icon = item.icon;
  return <>
    <span className="chef-row-icon"><Icon className="h-5 w-5" aria-hidden="true"/></span>
    <span className="chef-row-main"><span className={`chef-row-title block ${"action" in item && item.action === "sign-out" ? "!text-[#C4200F]" : ""}`}>{label}</span><span className="chef-row-meta block">{item.description}</span></span>
    {"href" in item ? <ChevronRight className="chef-chevron h-5 w-5" aria-hidden="true"/> : null}
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
 return <div className="chef-stack">
   <section className="chef-section" aria-busy={loading}>
    {loading ? <div className="flex items-center gap-4 p-4"><ChefSkeleton className="h-14 w-14 !rounded-full"/><div className="grid flex-1 gap-2"><ChefSkeleton className="h-4 w-1/2"/><ChefSkeleton className="h-3 w-1/3"/></div></div>
     : error ? <div className="p-4"><p role="alert" className="text-[0.9375rem] text-[#1A1A1A]">{error}</p><button type="button" onClick={()=>setRetry(value=>value+1)} className="chef-btn is-primary mt-4">Try again</button></div>
     : <div className="flex items-center gap-4 p-4 md:p-5">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-[#1A1A1A] font-display text-lg font-bold text-white" aria-hidden="true">{name.split(/\s+/).map(part=>part[0]).join("").slice(0,2).toUpperCase()||<UserRound className="h-6 w-6"/>}</span>
        <div className="min-w-0"><h2 className="truncate font-display text-xl font-bold tracking-tight text-[#1A1A1A]">{name}</h2><p className="mt-1 flex flex-wrap items-center gap-2 text-[0.9375rem] text-[#6B6B6B]"><span className="truncate">{kitchen?.kitchenName||"Your kitchen"}</span>{application?.status==="APPROVED"?<ChefPill tone="success">Verified chef</ChefPill>:<ChefPill tone="warning">Application in progress</ChefPill>}</p></div>
       </div>}
   </section>
   {groups(kitchen).map(group=><section key={group.title} aria-labelledby={`more-${group.title}`}>
    <h2 id={`more-${group.title}`} className="mb-2 px-1 text-[0.8125rem] font-semibold text-[#6B6B6B]">{group.title}</h2>
    <div className="chef-section chef-list">
     {group.items.map(item=>"href" in item
      ? <Link key={item.label} href={item.href} className="chef-row"><RowContent item={item} label={item.label}/></Link>
      : <button key={item.label} type="button" className={BUTTON_ROW} disabled={item.action==="sign-out"&&signOut.busy} onClick={()=>item.action==="switch"?switchToCustomerApp():void signOut.signOut()}><RowContent item={item} label={item.action==="sign-out"&&signOut.busy?"Signing out…":item.label}/></button>)}
    </div>
   </section>)}
   {signOut.error?<p role="alert" className="text-sm font-medium text-[#C4200F]">{signOut.error}</p>:null}
 </div>;
}

export default function ChefMorePage(){
 return <main className="chef-page is-narrow"><ChefAccessBoundary><ChefPageHeader title="More" description="Your kitchen, money and account."/><MoreHub/></ChefAccessBoundary></main>;
}
