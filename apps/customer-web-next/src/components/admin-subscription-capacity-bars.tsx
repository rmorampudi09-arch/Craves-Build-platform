"use client";

import { adminFetch } from "@/lib/admin-renewal";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, CircleAlert, RefreshCw } from "lucide-react";
import type { AdminSubscriptionPlan } from "@/lib/admin-subscription-plan-contract";
import { parseAdminSchedule, type AdminSubscriptionSchedule } from "@/lib/admin-subscription-runtime-contract";
import { parseChefCapacitySummary, type ChefCapacitySummary } from "@/lib/chef-subscription-capacity-contract";

const DAYS = [[1,"Monday"],[2,"Tuesday"],[3,"Wednesday"],[4,"Thursday"],[5,"Friday"],[6,"Saturday"],[7,"Sunday"]] as const;
const DEFAULT_DISH_LIMIT = 5;

type Row = { day:number; slot:string; need:number; limit:number; reserved:number; available:number; automatic:boolean; ready:boolean; note:string };

function label(day:number){ return DAYS.find(([value])=>value===day)?.[1] ?? `Day ${day}`; }

function buildRows(schedule:AdminSubscriptionSchedule, capacity:ChefCapacitySummary):Row[]{
  const perSlotDishes=new Map<string,Set<string>>();
  for(const item of schedule.items){ const set=perSlotDishes.get(item.mealSlotCode)??new Set<string>(); set.add(item.menuItemId); perSlotDishes.set(item.mealSlotCode,set); }
  const requested=new Map<string,number>();
  if(schedule.recurrenceType==="WEEKLY"){
    for(const item of schedule.items){ if(item.isoDayOfWeek==null) continue; const key=`${item.isoDayOfWeek}|${item.mealSlotCode}`; requested.set(key,(requested.get(key)??0)+item.quantity); }
  } else {
    const perDate=new Map<string,number>();
    for(const item of schedule.items){ if(item.dayOfMonth==null) continue; const key=`${item.dayOfMonth}|${item.mealSlotCode}`; perDate.set(key,(perDate.get(key)??0)+item.quantity); }
    const maxBySlot=new Map<string,number>();
    for(const [key,value] of perDate){ const slot=key.split("|")[1]; maxBySlot.set(slot,Math.max(maxBySlot.get(slot)??0,value)); }
    for(const [slot,value] of maxBySlot) for(const [day] of DAYS) requested.set(`${day}|${slot}`,value);
  }
  return [...requested.entries()].map(([key,need])=>{
    const [dayRaw,slot]=key.split("|"); const day=Number(dayRaw);
    const rule=capacity.slotRules.find(item=>item.isoDayOfWeek===day&&item.mealSlotCode===slot);
    if(!rule){ const limit=Math.max(DEFAULT_DISH_LIMIT,(perSlotDishes.get(slot)?.size??1)*DEFAULT_DISH_LIMIT); return {day,slot,need,limit,reserved:0,available:limit,automatic:true,ready:need<=limit,note:`Server default: ${DEFAULT_DISH_LIMIT} per dish`}; }
    const ready=rule.salesEnabled&&rule.recurringDeficitUnits===0&&rule.recurringAvailableUnits>=need;
    const note=!rule.salesEnabled?"Chef closed sales":rule.recurringDeficitUnits>0?`${rule.recurringDeficitUnits} deficit`:rule.recurringAvailableUnits<need?`Only ${rule.recurringAvailableUnits} available`:"Chef limit is sufficient";
    return {day,slot,need,limit:rule.subscriptionCapacityUnits,reserved:rule.recurringReservedUnits,available:rule.recurringAvailableUnits,automatic:false,ready,note};
  }).sort((a,b)=>a.slot.localeCompare(b.slot)||a.day-b.day);
}

function MetricBar({name,value,max,strong=false}:{name:string;value:number;max:number;strong?:boolean}){
  const width=max<=0?0:Math.min(100,(value/max)*100);
  return <div><div className="flex justify-between text-[11px]"><span className={strong?"font-bold text-slate-900":"text-slate-500"}>{name}</span><strong>{value}</strong></div><div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${strong?"bg-[#6930CA]":"bg-slate-400"}`} style={{width:`${width}%`}} /></div></div>;
}

export function AdminSubscriptionCapacityBars({plan}:{plan:AdminSubscriptionPlan}){
  const [schedule,setSchedule]=useState<AdminSubscriptionSchedule|null>(null);
  const [capacity,setCapacity]=useState<ChefCapacitySummary|null>(null);
  const [message,setMessage]=useState("Checking plan and capacity…");

  const [loading,setLoading]=useState(true);
  const [unavailable,setUnavailable]=useState(false);
  const requestId=useRef(0);

  const load=useCallback(async()=>{
    const currentRequest=++requestId.current;
    setLoading(true);setUnavailable(false);setSchedule(null);setCapacity(null);setMessage("Checking plan and capacity…");
    try {
      if(!plan.chefIdentityId)throw new Error("Chef identity is missing from this plan.");
      const [scheduleResult,capacityResult]=await Promise.allSettled([
        adminFetch(`/api/admin/subscription-plans/${plan.id}/schedule`,{cache:"no-store"}),
        adminFetch(`/api/admin/subscription-capacity/chefs/${plan.chefIdentityId}`,{cache:"no-store"}),
      ]);
      if(scheduleResult.status==="rejected")throw new Error("Chef meal schedule could not be retrieved. Please retry.");
      if(!scheduleResult.value.ok)throw new Error("Chef meal schedule could not be retrieved. Please retry.");
      const parsedSchedule=parseAdminSchedule(await scheduleResult.value.json().catch(()=>null));
      if(!parsedSchedule||parsedSchedule.planId!==plan.id)throw new Error("Chef meal schedule response is invalid.");
      if(capacityResult.status==="rejected")throw new Error("Chef capacity could not be retrieved. Please retry.");
      if(!capacityResult.value.ok)throw new Error("Chef capacity could not be retrieved. Please retry.");
      const parsedCapacity=parseChefCapacitySummary(await capacityResult.value.json().catch(()=>null));
      if(!parsedCapacity||parsedCapacity.chefIdentityId!==plan.chefIdentityId)throw new Error("Chef capacity response is invalid.");
      if(currentRequest!==requestId.current)return;
      setSchedule(parsedSchedule);setCapacity(parsedCapacity);setMessage("");
    } catch(error) {
      if(currentRequest===requestId.current){setUnavailable(true);setMessage(error instanceof Error?error.message:"Plan capacity is unavailable. Please retry.");}
    } finally {if(currentRequest===requestId.current)setLoading(false);}
  },[plan.id,plan.chefIdentityId]);

  useEffect(()=>{
    const requests=requestId;
    void load();
    return()=>{requests.current++;};
  },[load]);
  const currentSchedule=schedule?.planId===plan.id?schedule:null;
  const currentCapacity=capacity?.chefIdentityId===plan.chefIdentityId?capacity:null;
  const rows=useMemo(()=>currentSchedule&&currentCapacity?buildRows(currentSchedule,currentCapacity):[],[currentSchedule,currentCapacity]);
  const blockers=rows.filter(row=>!row.ready);
  const automatic=rows.filter(row=>row.automatic).length;
  const ready=Boolean(!loading&&!unavailable&&currentSchedule&&currentCapacity&&rows.length>0&&blockers.length===0&&!currentCapacity.adminSalesFrozen);
  const slots=currentSchedule?[...new Set(currentSchedule.items.map(item=>item.mealSlotCode))].join(", "):"—";

  return <section className="rounded-2xl border border-[#eadfd0] bg-white p-5 text-slate-950">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#6930CA]">Approval comparison</p><h4 className="mt-1 text-xl font-bold">Plan capacity at a glance</h4><p className="mt-1 text-xs text-slate-500">Missing rules preview the automatic server default of 5 subscription units per selected dish. Chef-defined limits still override defaults.</p></div><button type="button" disabled={loading} onClick={()=>void load()} className="inline-flex items-center gap-2 rounded-xl border border-[#d9cdbd] px-3 py-2 text-xs font-bold disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading?"animate-spin":""}`}/>{loading?"Checking…":"Refresh capacity comparison"}</button></div>

    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-xl bg-[#FFF8EC] p-4"><p className="text-xs font-bold uppercase text-slate-500">Plan</p><p className="mt-1 font-bold">{plan.name}</p><p className="mt-1 text-xs">{plan.billingPeriod} · ₹{plan.amount} · {plan.status}</p></div>
      <div className="rounded-xl bg-[#FFF8EC] p-4"><p className="text-xs font-bold uppercase text-slate-500">Schedule</p><p className="mt-1 font-bold">{currentSchedule?`${currentSchedule.items.length} meal row(s)`:loading?"Loading…":"Unavailable"}</p><p className="mt-1 text-xs">{slots}{currentSchedule?` · ${currentSchedule.generationLeadHours}h lead`:""}</p></div>
      <div className="rounded-xl bg-[#FFF8EC] p-4"><p className="text-xs font-bold uppercase text-slate-500">Checks</p><p className="mt-1 font-bold">{loading?"Checking…":unavailable?"Unavailable":`${rows.length-blockers.length}/${rows.length} ready`}</p><p className="mt-1 text-xs">{currentSchedule&&currentCapacity?`${automatic} server default(s)`:"—"}</p></div>
      <div className={`rounded-xl p-4 ${ready?"bg-emerald-50":"bg-amber-50"}`}>{ready?<CheckCircle2 className="h-5 w-5 text-emerald-700"/>:<CircleAlert className="h-5 w-5 text-amber-700"/>}<p className="mt-2 text-xs font-bold uppercase text-slate-500">Decision</p><p className={`mt-1 font-bold ${ready?"text-emerald-800":"text-amber-800"}`}>{loading?"Checking capacity…":unavailable?"Capacity check unavailable":ready?"Ready to approve":"Review required"}</p></div>
    </div>

    {message&&<p role="status" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{message}</p>}
    {currentCapacity?.adminSalesFrozen&&<p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">Operations has frozen new subscription sales for this Chef: {currentCapacity.freezeReason??"No reason supplied."}</p>}

    <div className="mt-5 space-y-3">{rows.map(row=>{const max=Math.max(1,row.limit,row.reserved+row.need);return <article key={`${row.day}-${row.slot}`} className={`rounded-2xl border p-4 ${row.ready?"border-emerald-200":"border-amber-300"}`}><div className="flex flex-wrap justify-between gap-2"><div><strong>{label(row.day)} · {row.slot}</strong><p className="mt-1 text-xs text-slate-500">{row.automatic?"Automatic default":"Chef configured"}</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${row.ready?"bg-emerald-50 text-emerald-800":"bg-amber-50 text-amber-900"}`}>{row.ready?"READY ✓":row.note}</span></div><div className="mt-4 grid gap-3 md:grid-cols-4"><MetricBar name="Plan needs" value={row.need} max={max} strong/><MetricBar name="Reserved" value={row.reserved} max={max}/><MetricBar name="Available" value={row.available} max={max}/><MetricBar name="Limit" value={row.limit} max={max}/></div></article>})}</div>
  </section>;
}
