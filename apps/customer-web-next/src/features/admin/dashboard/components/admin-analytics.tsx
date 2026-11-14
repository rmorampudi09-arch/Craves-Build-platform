"use client";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {useCallback,useEffect,useRef,useState} from "react";
import {ArrowRight,ArrowUpRight,RefreshCw,Users,ChefHat,PackageSearch,Download,Truck} from "lucide-react";
import {adminFetch} from "@/features/admin/shell/lib/admin-renewal";
import {DATASETS,EMPTY_FILTERS,META,explorerHref,parseExplorerResult,presetDates,type Dataset,type Filters,type ExplorerResult} from "@/features/admin/explorer/lib/admin-explorer";
import {adminMetricCsv,formatAdminTimestamp} from "@/features/admin/shell/lib/admin-navigation";
import {StatusChart,TrendChart} from "@/features/admin/explorer/components/admin-explorer-charts";
import {ExplorerPurpose} from "@/features/admin/explorer/components/admin-explorer-session";
import "@/features/admin/styles/admin-explorer.css";
const icons={users:Users,chefs:ChefHat,orders:PackageSearch};
export function AdminAnalytics(){
 const router=useRouter();
 const [filters,setFilters]=useState({...EMPTY_FILTERS});const [draft,setDraft]=useState({...EMPTY_FILTERS});
 const [reports,setReports]=useState<Partial<Record<Dataset,ExplorerResult>>>({});const [errors,setErrors]=useState<Partial<Record<Dataset,string>>>({});
 const [busy,setBusy]=useState(false);const sequence=useRef(0);const active=useRef<AbortController|null>(null);
 const load=useCallback(async(f:Filters)=>{
  active.current?.abort();const controller=new AbortController();active.current=controller;const seq=++sequence.current;
  setBusy(true);setReports({});setErrors({});
  await Promise.all(DATASETS.map(async dataset=>{
   try{const response=await adminFetch(`/api/admin/explorer/${dataset}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...f,mode:'summary'}),signal:controller.signal});
    if(!response.ok)throw new Error(response.status===403?'Your role does not allow bulk analytics.':response.status===409?'Session renewed. Refresh to continue.':'This service is not available or not yet activated.');
    const r=parseExplorerResult(await response.json(),dataset);if(!r)throw new Error('The report could not be verified.');
    if(seq===sequence.current)setReports(prev=>({...prev,[dataset]:r}));
   }catch(e){if(seq===sequence.current&&!controller.signal.aborted)setErrors(prev=>({...prev,[dataset]:e instanceof Error?e.message:'Report unavailable.'}));}
  }));if(seq===sequence.current)setBusy(false);
 },[]);
 const cancelPending=useCallback(()=>{sequence.current++;active.current?.abort();},[]);
 useEffect(()=>{void load(EMPTY_FILTERS);return cancelPending;},[load,cancelPending]);
 function apply(f:Filters){setFilters(f);setDraft(f);void load(f);}
 function exportTotals(){
  // Aggregate counts only (the same rule as the old overview export): no names, phones or IDs.
  const counts:Record<string,number>={};const generated=DATASETS.map(dataset=>reports[dataset]?.generatedAt).find(Boolean);
  for(const dataset of DATASETS){const r=reports[dataset];if(!r)continue;counts[`${dataset}Total`]=r.total;for(const s of r.statuses)counts[`${dataset}${s.key.toLowerCase().replace(/(^|_)([a-z])/g,(_m,_u,c:string)=>c.toUpperCase())}`]=s.count;}
  if(!generated)return;const url=URL.createObjectURL(new Blob([adminMetricCsv(counts,generated)],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download=`craves-report-totals-${new Date(generated).toISOString().slice(0,10)}.csv`;document.body.appendChild(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 const loaded=DATASETS.some(dataset=>reports[dataset]);
 return <div className="ex-workspace"><div className="ad-intro-actions"><button type="button" className="cr-button" disabled={busy} onClick={()=>void load(filters)}><RefreshCw size={16} aria-hidden="true" className={busy?'cr-spin':''}/>{busy?'Refreshing…':'Refresh all'}</button><button type="button" className="cr-button" disabled={!loaded} onClick={exportTotals}><Download size={16} aria-hidden="true"/>Export totals</button><span className="cr-muted">Totals only: no names, phone numbers or order IDs.</span></div>
 <form className="ex-toolbar" onSubmit={e=>{e.preventDefault();apply(draft);}}><div className="ex-presets">{[0,7,30,90].map(days=><button type="button" key={days} onClick={()=>apply({...EMPTY_FILTERS,...presetDates(days)})}>{days===0?'All time':`${days} days`}</button>)}</div>
 <label>Created from · IST<input aria-label="Created from" type="date" value={draft.fromDate} min="1970-01-01" max="2100-12-31" onChange={e=>setDraft({...draft,fromDate:e.target.value})}/></label><label>Through · IST<input aria-label="Created through" type="date" value={draft.toDate} min={draft.fromDate||'1970-01-01'} max="2100-12-31" onChange={e=>setDraft({...draft,toDate:e.target.value})}/></label><button className="cr-button cr-primary" disabled={busy}>Apply period</button></form>
 <div className="ex-scope">Showing records created {filters.fromDate||'since the beginning'} → {filters.toDate||'now'}. Status charts show where each record is now, not its history. Each count is taken when the page loads.</div>
 <section className="ex-overview-cards" aria-label="Open all records">{DATASETS.map(dataset=>{const r=reports[dataset],Icon=icons[dataset];return <Link key={dataset} href={explorerHref(dataset,filters)} className="ex-overview-card"><span><Icon size={21}/><ArrowUpRight size={18}/></span><p>{META[dataset].title}</p><strong>{r?r.total.toLocaleString('en-IN'):errors[dataset]?<span aria-hidden="true">—</span>:'…'}</strong><small>{!r&&errors[dataset]?"Couldn't load right now":META[dataset].noun} · View all with filters</small></Link>;})}</section>
 <ExplorerPurpose/>
 {DATASETS.map(dataset=>{const r=reports[dataset];return <section key={dataset} className="cr-panel ex-analytics-panel"><div className="cr-section-heading"><div><p className="cr-eyebrow">{META[dataset].noun}</p><h2>{META[dataset].title} at a glance</h2><p className="cr-muted">{META[dataset].description}</p></div><Link href={explorerHref(dataset,filters)} className="cr-button">View all {META[dataset].title.toLowerCase()}<ArrowRight size={16}/></Link></div>
 {r?<><div className="ex-chart-pair"><div><h3>Current status</h3><StatusChart result={r} onSelect={status=>router.push(explorerHref(dataset,{...filters,status}))}/></div><div><h3>Created over time</h3><TrendChart result={r} onSelect={(fromDate,toDate)=>router.push(explorerHref(dataset,{...filters,fromDate,toDate}))}/></div></div><p className="cr-footnote">Snapshot {formatAdminTimestamp(r.generatedAt)} · Read-only, source-owned counts.</p></>:errors[dataset]?<div className="cr-alert" role="status">{errors[dataset]} No sample counts have been substituted.</div>:<div className="ex-skeleton" aria-label="Loading report"/>}</section>;})}
 <section className="cr-panel" aria-labelledby="ad-delivery-companies"><div className="cr-section-heading"><div><h2 id="ad-delivery-companies">Delivery companies</h2><p className="cr-muted">Delivery Intelligence: which delivery company was chosen for each order and why, delivery history, retries and reconciliation. It opens in its own app.</p></div><a className="cr-button" href="https://admin.craves.in/delivery-intelligence"><Truck size={16} aria-hidden="true"/>Open Delivery Intelligence<ArrowUpRight size={15} aria-hidden="true"/></a></div><p className="cr-footnote">In the old admin: “Delivery Intelligence”.</p></section><aside className="ex-next-actions"><h2>Act on what you found</h2><p>Reports only show numbers. Approving a kitchen, moving money or booking a delivery happens on these pages.</p><div><Link href="/admin/chef-reviews">Kitchens › To approve <ArrowRight size={15} aria-hidden="true"/></Link><Link href="/admin/operations">Orders › Look up an order <ArrowRight size={15} aria-hidden="true"/></Link><Link href="/admin/finance">Finance <ArrowRight size={15} aria-hidden="true"/></Link><Link href="/admin/notifications">Settings › Messages not sent <ArrowRight size={15} aria-hidden="true"/></Link></div></aside>
 </div>;
}
