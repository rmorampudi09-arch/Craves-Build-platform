"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { parseChefCapacitySummary, type ChefCapacitySummary } from "@/lib/chef-subscription-capacity-contract";

const DAYS = [[1,"Mon"],[2,"Tue"],[3,"Wed"],[4,"Thu"],[5,"Fri"],[6,"Sat"],[7,"Sun"]] as const;
const SLOTS = [["BREAKFAST","Breakfast"],["LUNCH","Lunch"],["DINNER","Dinner"],["SNACK","Snack"]] as const;

export function ChefCapacityQuickSetup() {
  const [summary,setSummary]=useState<ChefCapacitySummary|null>(null);
  const [slot,setSlot]=useState("LUNCH");
  const [allDays,setAllDays]=useState(true);
  const [day,setDay]=useState("1");
  const [total,setTotal]=useState("");
  const [subscription,setSubscription]=useState("");
  const [message,setMessage]=useState("Loading capacity…");
  const [busy,setBusy]=useState(false);

  const load=useCallback(async()=>{
    const r=await fetch("/api/chef/subscription-capacity",{cache:"no-store"});
    const b=await r.json().catch(()=>null);
    if(!r.ok) throw new Error(typeof b?.message==="string"?b.message:"Capacity could not be loaded.");
    const parsed=parseChefCapacitySummary(b);
    if(!parsed) throw new Error("Invalid capacity response.");
    setSummary(parsed); setMessage("");
  },[]);

  useEffect(()=>{void load().catch(e=>setMessage(e instanceof Error?e.message:"Capacity unavailable."));},[load]);

  const readiness=useMemo(()=>DAYS.map(([value,label])=>{
    const rule=summary?.slotRules.find(r=>r.isoDayOfWeek===value&&r.mealSlotCode===slot);
    return {value,label,rule,ready:Boolean(rule&&rule.salesEnabled&&rule.recurringDeficitUnits===0)};
  }),[summary,slot]);

  async function save(){
    const totalUnits=Number(total), subUnits=Number(subscription);
    if(!Number.isInteger(totalUnits)||!Number.isInteger(subUnits)||totalUnits<0||subUnits<0||subUnits>totalUnits){setMessage("Enter valid capacity values. Subscription capacity cannot exceed total capacity.");return;}
    setBusy(true); setMessage("");
    try{
      const targets=allDays?DAYS.map(([value])=>value):[Number(day)];
      for(const isoDayOfWeek of targets){
        const r=await fetch("/api/chef/subscription-capacity/rules/slots",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({isoDayOfWeek,mealSlotCode:slot,totalCapacityUnits:totalUnits,subscriptionCapacityUnits:subUnits,salesEnabled:true,reason:"Chef quick capacity setup"})});
        const b=await r.json().catch(()=>null);
        if(!r.ok) throw new Error(typeof b?.message==="string"?b.message:"Capacity rule could not be saved.");
      }
      await load(); setMessage(allDays?`${slot} capacity applied to all 7 weekdays.`:`${slot} capacity saved.`);
    }catch(e){setMessage(e instanceof Error?e.message:"Capacity could not be saved.");}finally{setBusy(false);}
  }

  const readyCount=readiness.filter(item=>item.ready).length;
  const slotLabel=SLOTS.find(([value])=>value===slot)?.[1]??slot;

  return <section className="rounded-2xl border border-border bg-white p-5 shadow-[var(--shadow-card)] md:p-6">
    <p className="craves-overline text-primary">Quick setup</p>
    <h2 className="mt-1 font-display text-2xl font-bold text-ink">Make a meal slot ready for subscriptions</h2>
    <p className="mt-2 text-sm text-muted-foreground">Monthly plans should use the same slot on all 7 weekdays. Weekly plans can use one weekday.</p>
    <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <label className="text-sm font-semibold">Meal slot<select value={slot} onChange={e=>setSlot(e.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-border bg-white px-3">{SLOTS.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
      <label className="text-sm font-semibold">Apply to<select value={allDays?"ALL":"ONE"} onChange={e=>setAllDays(e.target.value==="ALL")} className="mt-2 min-h-11 w-full rounded-xl border border-border bg-white px-3"><option value="ALL">All 7 days · monthly</option><option value="ONE">One weekday · weekly</option></select></label>
      {!allDays&&<label className="text-sm font-semibold">Weekday<select value={day} onChange={e=>setDay(e.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-border bg-white px-3">{DAYS.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>}
      <label className="text-sm font-semibold">Total meals<input type="number" min="0" value={total} onChange={e=>setTotal(e.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-border px-3" /></label>
      <label className="text-sm font-semibold">Subscription meals<input type="number" min="0" value={subscription} onChange={e=>setSubscription(e.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-border px-3" /></label>
    </div>
    <button type="button" disabled={busy} onClick={()=>void save()} className="btn-primary mt-4 disabled:opacity-50">{busy?"Saving…":allDays?"Apply to all 7 days":"Save weekday capacity"}</button>
    {message&&<p role="status" className="mt-4 rounded-xl border border-border p-3 text-sm">{message}</p>}
    <div className="mt-5 flex items-center justify-between gap-3"><h3 className="font-display text-lg font-bold">{slotLabel} readiness</h3><span className="rounded-full bg-secondary px-3 py-1 text-xs font-bold">{readyCount}/7 ready</span></div>
    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-7">{readiness.map(item=><div key={item.value} className={`rounded-xl border p-3 ${item.ready?"border-success/20 bg-success/5":"border-amber-200 bg-amber-50"}`}><p className="font-bold">{item.label}</p><p className="mt-1 text-xs">{item.ready?"Ready":"Needs setup"}</p>{item.rule&&<p className="mt-1 text-xs text-muted-foreground">{item.rule.subscriptionCapacityUnits} limit · {item.rule.recurringAvailableUnits} free</p>}</div>)}</div>
  </section>;
}
