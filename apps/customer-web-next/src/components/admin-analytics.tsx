"use client";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {useCallback,useEffect,useRef,useState} from "react";
import {ArrowRight,ArrowUpRight,RefreshCw,Users,ChefHat,PackageSearch,BarChart3} from "lucide-react";
import {adminFetch} from "@/lib/admin-renewal";
import {DATASETS,EMPTY_FILTERS,META,explorerHref,parseExplorerResult,presetDates,type Dataset,type Filters,type ExplorerResult} from "@/lib/admin-explorer";
import {formatAdminTimestamp} from "@/lib/admin-navigation";
import {StatusChart,TrendChart} from "@/components/admin-explorer-charts";
import {ExplorerPurpose} from "@/components/admin-explorer-session";
import "@/styles/admin-explorer.css";
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
 useEffect(()=>{void load(EMPTY_FILTERS);return()=>{sequence.current++;active.current?.abort();};},[load]);
 function apply(f:Filters){setFilters(f);setDraft(f);void load(f);}
 return <div className="ex-workspace"><header className="ex-hero"><div><p className="cr-eyebrow"><BarChart3 size={14}/> Marketplace analytics</p><h1>See the whole picture.<br/><span>Go straight to the records.</span></h1><p>People, home chefs and every order — connected to the lists behind the numbers.</p></div><button className="cr-button" disabled={busy} onClick={()=>void load(filters)}><RefreshCw size={16} className={busy?'cr-spin':''}/>{busy?'Refreshing…':'Refresh all'}</button></header>
 <form className="ex-toolbar" onSubmit={e=>{e.preventDefault();apply(draft);}}><div className="ex-presets">{[0,7,30,90].map(days=><button type="button" key={days} onClick={()=>apply({...EMPTY_FILTERS,...presetDates(days)})}>{days===0?'All time':`${days} days`}</button>)}</div>
 <label>Created from · IST<input aria-label="Created from" type="date" value={draft.fromDate} min="1970-01-01" max="2100-12-31" onChange={e=>setDraft({...draft,fromDate:e.target.value})}/></label><label>Through · IST<input aria-label="Created through" type="date" value={draft.toDate} min={draft.fromDate||'1970-01-01'} max="2100-12-31" onChange={e=>setDraft({...draft,toDate:e.target.value})}/></label><button className="cr-button cr-primary" disabled={busy}>Apply period</button></form>
 <div className="ex-scope">Showing records created {filters.fromDate||'since the beginning'} → {filters.toDate||'now'}. Status charts show current status, not historical status transitions. Each service has its own snapshot.</div>
 <section className="ex-overview-cards" aria-label="Open all records">{DATASETS.map(dataset=>{const r=reports[dataset],Icon=icons[dataset];return <Link key={dataset} href={explorerHref(dataset,filters)} className="ex-overview-card"><span><Icon size={21}/><ArrowUpRight size={18}/></span><p>{META[dataset].title}</p><strong>{r?r.total.toLocaleString('en-IN'):errors[dataset]?'Unavailable':'…'}</strong><small>{META[dataset].noun} · View all with filters</small></Link>;})}</section>
 <ExplorerPurpose/>
 {DATASETS.map(dataset=>{const r=reports[dataset];return <section key={dataset} className="cr-panel ex-analytics-panel"><div className="cr-section-heading"><div><p className="cr-eyebrow">{META[dataset].noun}</p><h2>{META[dataset].title} at a glance</h2><p className="cr-muted">{META[dataset].description}</p></div><Link href={explorerHref(dataset,filters)} className="cr-button">View all {META[dataset].title.toLowerCase()}<ArrowRight size={16}/></Link></div>
 {r?<><div className="ex-chart-pair"><div><h3>Current status</h3><StatusChart result={r} onSelect={status=>router.push(explorerHref(dataset,{...filters,status}))}/></div><div><h3>Created over time</h3><TrendChart result={r} onSelect={(fromDate,toDate)=>router.push(explorerHref(dataset,{...filters,fromDate,toDate}))}/></div></div><p className="cr-footnote">Snapshot {formatAdminTimestamp(r.generatedAt)} · Read-only, source-owned counts.</p></>:errors[dataset]?<div className="cr-alert" role="status">{errors[dataset]} No sample counts have been substituted.</div>:<div className="ex-skeleton" aria-label="Loading report"/>}</section>;})}
 <aside className="ex-next-actions"><h2>From insight to action</h2><p>Use existing authorized workflows after identifying the record. Graphs never approve a chef, move money or dispatch a courier.</p><div><Link href="/admin/chef-reviews">Review chef applications <ArrowRight size={15}/></Link><Link href="/admin/operations">Investigate an order <ArrowRight size={15}/></Link><Link href="/admin/finance">Open finance controls <ArrowRight size={15}/></Link><Link href="/admin/notifications">Recover notifications <ArrowRight size={15}/></Link></div></aside>
 </div>;
}
