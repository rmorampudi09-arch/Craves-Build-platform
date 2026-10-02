"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BadgeIndianRupee, Bell, CalendarDays, ChevronRight, FileCheck2, MapPin, Store, UserRound } from "lucide-react";
import { ChefAccessBoundary } from "@/components/chef-access-boundary";
import { ChefPageHeader } from "@/components/chef-page-header";

type Application = { firstName:string|null; lastName:string|null; email:string|null; phoneNumber:string|null; status:string };
type Kitchen = { kitchenName:string; description:string|null; addressLine1:string; addressLine2:string|null; areaName:string|null; city:string; state:string; postalCode:string|null; status:string };

function ProfileContent(){
 const [application,setApplication]=useState<Application|null>(null);
 const [kitchen,setKitchen]=useState<Kitchen|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState(false);
 const [retry,setRetry]=useState(0);
 useEffect(()=>{let active=true; setLoading(true); setError(false); void Promise.all([fetch("/api/chef/application",{cache:"no-store"}),fetch("/api/chef/kitchen",{cache:"no-store"})]).then(async([a,k])=>{if(!a.ok || !k.ok) throw new Error("Profile unavailable");const av=a.ok?await a.json().catch(()=>null):null;const kv=k.ok?await k.json().catch(()=>null):null;if(active){setApplication(av);setKitchen(kv);setLoading(false)}}).catch(()=>{if(active){setError(true);setLoading(false)}});return()=>{active=false}},[retry]);
 if(loading)return <div className="h-80 animate-pulse rounded-3xl bg-[#F1F3F5]" aria-label="Loading profile"/>;
 if(error)return <section className="rounded-3xl border border-[#E5E7EB] bg-white p-6"><p role="alert">Your profile could not load. Please try again.</p><button type="button" onClick={()=>setRetry(value=>value+1)} className="mt-4 min-h-12 rounded-md bg-primary px-5 text-white">Try again</button></section>;
 const name=[application?.firstName,application?.lastName].filter(Boolean).join(" ")||"Chef";
 const address=[kitchen?.addressLine1,kitchen?.addressLine2,kitchen?.areaName,kitchen?.city,kitchen?.state,kitchen?.postalCode].filter(Boolean).join(", ");
 const items=[
  {href:"/chef/application",icon:UserRound,title:"Personal details",desc:name},
  {href:"/chef/kitchen",icon:Store,title:"Kitchen details",desc:kitchen?.kitchenName||"Add your kitchen details"},
  {href:"/chef/kitchen",icon:MapPin,title:"Kitchen location",desc:address||"Add your pickup location"},
  {href:"/chef/earnings",icon:BadgeIndianRupee,title:"Earnings & payouts",desc:"See what you get from completed orders"},
  {href:"/chef/meal-plans",icon:CalendarDays,title:"Meal Plans",desc:"Manage your dishes, schedules and availability"},
  {href:"/notifications",icon:Bell,title:"Notifications",desc:"Orders, payments and account updates"},
  {href:"/chef/application",icon:FileCheck2,title:"Documents & verification",desc:application?.status==="APPROVED"?"Application approved":"View your verification status"},
 ];
 return <div className="space-y-5">
   <section className="rounded-3xl border border-[#E5E7EB] bg-white p-6 sm:p-8">
    <div className="flex items-start gap-4">
      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#EAF7F0] text-[#178F56]"><UserRound className="h-7 w-7" aria-hidden="true"/></div>
      <div className="min-w-0"><p className="text-sm font-semibold text-[#178F56]">Chef profile</p><h2 className="mt-1 text-2xl font-bold text-[#1A1A1A]">{name}</h2><p className="mt-1 text-sm text-[#6B6B6B]">{kitchen?.kitchenName||"Your kitchen"} · {application?.status==="APPROVED"?"Verified chef":"Application in progress"}</p></div>
    </div>
   </section>
   <section className="overflow-hidden rounded-3xl border border-[#E5E7EB] bg-white">
    {items.map((item,index)=>{const Icon=item.icon;return <Link key={item.href+item.title} href={item.href} className={`flex min-h-[76px] items-center gap-4 px-5 py-4 transition hover:bg-[#F7F8F7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#178F56] sm:px-6 ${index?"border-t border-[#E5E7EB]":""}`}><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] text-[#178F56]"><Icon className="h-5 w-5" aria-hidden="true"/></span><span className="min-w-0 flex-1"><strong className="block text-sm text-[#1A1A1A]">{item.title}</strong><span className="mt-1 block truncate text-sm text-[#6B6B6B]">{item.desc}</span></span><ChevronRight className="h-5 w-5 shrink-0 text-[#6B6B6B]" aria-hidden="true"/></Link>})}
   </section>
   <section className="grid gap-3 sm:grid-cols-2" aria-label="Additional verification"><div className="rounded-2xl border border-[#E5E7EB] bg-white p-5"><h3 className="font-semibold">Food safety details</h3><p className="mt-2 text-sm text-[#6B6B6B]">FSSAI submission is not available yet. Chef identity approval does not confirm food-business compliance.</p></div><div className="rounded-2xl border border-[#E5E7EB] bg-white p-5"><h3 className="font-semibold">Kitchen photos</h3><p className="mt-2 text-sm text-[#6B6B6B]">Kitchen photo uploads are not available yet.</p></div></section>
   <section className="rounded-2xl border border-[#E5E7EB] bg-white p-5 text-sm text-[#6B6B6B]"><p className="font-semibold text-[#1A1A1A]">Keep your details current</p><p className="mt-1 leading-6">Customers see your kitchen information, while payout and verification information stays protected behind your signed-in Chef access.</p></section>
 </div>;
}

export default function ChefProfilePage(){
 return <main className="mx-auto min-h-screen max-w-4xl px-4 py-6 md:px-6 md:py-8"><ChefPageHeader eyebrow="Your account" title="Profile" description="Keep your personal details, kitchen information, documents and payout links easy to find."/><div className="mt-6"><ChefAccessBoundary><ProfileContent/></ChefAccessBoundary></div></main>;
}
