"use client";
import Link from "next/link";
import {useCallback,useEffect,useRef,useState} from "react";
import {ArrowLeft,ArrowRight,Copy,Download,Filter,RefreshCw,Search,ShieldCheck,SlidersHorizontal,X} from "lucide-react";
import {adminFetch} from "@/lib/admin-renewal";
import {DATASETS,EMPTY_FILTERS,META,aggregateCsv,explorerHref,parseExplorerRequest,parseExplorerResult,presetDates,type Dataset,type Filters,type ExplorerResult,type ExplorerRow} from "@/lib/admin-explorer";
import {formatAdminTimestamp,readableAdminStatus} from "@/lib/admin-navigation";
import {ExplorerPurpose,useExplorerSession} from "@/components/admin-explorer-session";
import {StatusChart,TrendChart} from "@/components/admin-explorer-charts";
import "@/styles/admin-explorer.css";
const money=(amount:string)=>{const [whole,fraction]=amount.split('.');return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g,',')}.${fraction}`;};
export function AdminRecordExplorer({dataset,initial}:{dataset:Dataset;initial:Filters}){
 const {reason}=useExplorerSession();const initialReason=useRef(reason);
 const [draft,setDraft]=useState<Filters>(initial),[applied,setApplied]=useState<Filters>(initial);
 const [data,setData]=useState<ExplorerResult|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const [cursors,setCursors]=useState<(string|undefined)[]>([undefined]);const [selected,setSelected]=useState<ExplorerRow|null>(null);
 const [compact,setCompact]=useState(false),[contacts,setContacts]=useState(true),[dates,setDates]=useState(true),[feedback,setFeedback]=useState("");
 const drawer=useRef<HTMLDialogElement>(null),list=useRef<HTMLElement>(null),active=useRef<AbortController|null>(null),sequence=useRef(0);
 const pendingScroll=useRef(false);
 const meta=META[dataset];
 const load=useCallback(async(f:Filters,purpose:string,cursor?:string,boundary?:string)=>{
  const mode=purpose.trim().length>=10?'records':'summary';
  const query=parseExplorerRequest({...f,mode,...(mode==='records'?{reason:purpose}:{}),...(cursor?{cursor}:{}),...(boundary?{boundary}:{})},dataset);
  if(!query){setError('Check the date range, filters and operational purpose. No query was sent.');return;}
  active.current?.abort();const controller=new AbortController();active.current=controller;const seq=++sequence.current;
  setBusy(true);setError('');setData(null);setSelected(null);drawer.current?.close();
  try{
   const response=await adminFetch(`/api/admin/explorer/${dataset}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(query),signal:controller.signal});
   if(!response.ok)throw new Error(response.status===403?'Platform or audit administrator access is required.':response.status===401?'Sign in again to continue.':response.status===409?'Your session was renewed. Click Refresh to retry this read.':response.status===429?'Two reports are already running. Retry in a moment.':response.status===400?'The query or cursor is invalid. Reset the filters and start at page one.':'This report is unavailable or not yet activated. No substitute records are shown.');
   const parsed=parseExplorerResult(await response.json(),dataset);if(!parsed)throw new Error('The returned report could not be verified.');
   if(seq===sequence.current){setData(parsed);setApplied(f);
    if(pendingScroll.current){pendingScroll.current=false;window.requestAnimationFrame(()=>list.current?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'}));}}
  }catch(e){if(seq===sequence.current&&!controller.signal.aborted)setError(e instanceof Error?e.message:'Report unavailable.');}
  finally{if(seq===sequence.current)setBusy(false);}
 },[dataset]);
 useEffect(()=>{void load(initial,initialReason.current);return()=>{sequence.current++;active.current?.abort();};},[initial,load]);
 function apply(f:Filters,scroll=false){
  pendingScroll.current=scroll;setDraft(f);setCursors([undefined]);setFeedback('');void load(f,reason,undefined,scroll?data?.boundary:undefined);
 }
 function page(next:boolean){
  if(!data||busy)return;
  const history=next?[...cursors,data.nextCursor??undefined]:cursors.slice(0,-1);
  if(history.length===0 || (next&&!data.nextCursor))return;
  setCursors(history);void load(applied,reason,history[history.length-1],data.boundary);
 }
 async function copy(value:string,message:string){try{await navigator.clipboard.writeText(value);setFeedback(message);}catch{setFeedback('Clipboard unavailable. Select and copy the text manually.');}}
 function exportSummary(){
  if(!data||busy)return;const url=URL.createObjectURL(new Blob([aggregateCsv(data)],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download=`craves-${dataset}-aggregate-${data.generatedAt.slice(0,10)}.csv`;document.body.appendChild(a);a.click();a.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);setFeedback('Aggregate CSV exported. Individual records and search terms were not included.');
 }
 function open(row:ExplorerRow){setSelected(row);window.requestAnimationFrame(()=>drawer.current?.showModal());}
 function close(){drawer.current?.close();setSelected(null);}
 return <div className="ex-workspace"><header className="ex-page-heading"><div><Link href="/admin/analytics" className="ex-back"><ArrowLeft size={15}/>Marketplace analytics</Link><h1>{meta.title} explorer</h1><p>{meta.description}</p></div><span className="cr-badge"><ShieldCheck size={14}/>Audited read-only workspace</span></header>
 <nav className="ex-dataset-tabs" aria-label="Record type">{DATASETS.map(d=><Link key={d} href={explorerHref(d,{fromDate:applied.fromDate,toDate:applied.toDate})} aria-current={dataset===d?'page':undefined}>{META[d].title}<ArrowUp d={dataset===d}/></Link>)}</nav>
 <section className="cr-panel ex-filter-panel"><div className="cr-section-heading"><div><p className="cr-eyebrow">Choose your view</p><h2><Filter size={18}/>Find exactly what you need</h2></div><div className="ex-presets">{[0,7,30,90].map(days=><button type="button" disabled={busy} key={days} onClick={()=>apply({...EMPTY_FILTERS,...presetDates(days)})}>{days===0?'All time':`${days} days`}</button>)}</div></div>
 <form onSubmit={e=>{e.preventDefault();apply(draft);}}><div className="ex-filter-grid">
  <label className="ex-search-label"><span>Search all matching records</span><div><Search size={17}/><input type="search" aria-label="Search all matching records" maxLength={160} value={draft.search} onChange={e=>setDraft({...draft,search:e.target.value})} placeholder={meta.hint}/></div></label>
  <label>Created from · IST<input aria-label="Created from" type="date" value={draft.fromDate} min="1970-01-01" max="2100-12-31" onChange={e=>setDraft({...draft,fromDate:e.target.value})}/></label>
  <label>Through · IST<input aria-label="Created through" type="date" value={draft.toDate} min={draft.fromDate||'1970-01-01'} max="2100-12-31" onChange={e=>setDraft({...draft,toDate:e.target.value})}/></label>
  <label>Current status<select aria-label="Current status" value={draft.status} onChange={e=>setDraft({...draft,status:e.target.value})}><option value="">All statuses</option>{[...new Set([...(data?.statuses.map(s=>s.key)??[]),...(draft.status?[draft.status]:[])])].map(s=><option key={s} value={s}>{readableAdminStatus(s)}</option>)}</select></label>
  <label>{meta.facet}{dataset==='orders'?<select aria-label={meta.facet} value={draft.facet} onChange={e=>setDraft({...draft,facet:e.target.value})}><option value="">Both sources</option><option value="ON_DEMAND">On demand</option><option value="SUBSCRIPTION">Subscription</option></select>:<input aria-label={meta.facet} value={draft.facet} maxLength={dataset==='users'?40:120} placeholder={dataset==='users'?'e.g. CUSTOMER or CHEF':'e.g. Hyderabad'} onChange={e=>setDraft({...draft,facet:dataset==='users'?e.target.value.toUpperCase():e.target.value})}/>}</label>
  <label>Sort<select aria-label="Sort records" value={draft.sort} onChange={e=>setDraft({...draft,sort:e.target.value==='oldest'?'oldest':'newest'})}><option value="newest">Newest created first</option><option value="oldest">Oldest created first</option></select></label>
  <label>Page size<select aria-label="Page size" value={draft.pageSize} onChange={e=>setDraft({...draft,pageSize:Number(e.target.value) as 25|50|100})}><option value="25">25</option><option value="50">50</option><option value="100">100</option></select></label>
 </div><ExplorerPurpose/><div className="ex-filter-actions"><button className="cr-button cr-primary" disabled={busy}>{reason.trim().length>=10?'Apply & show records':'Apply & show counts'}</button><button type="button" className="cr-button" disabled={busy} onClick={()=>apply({...EMPTY_FILTERS})}>Reset all filters</button><button type="button" className="cr-button" disabled={busy} onClick={()=>{setCursors([undefined]);void load(applied,reason);}}><RefreshCw size={15} className={busy?'cr-spin':''}/>Refresh</button></div></form>
 </section>
 {error&&<div className="cr-alert" role="alert">{error}</div>}
 {busy&&<div className="ex-skeleton" role="status" aria-label="Loading matching records">Loading verified counts and records…</div>}
 {data&&<><div className="ex-applied-filters"><span>Applied view:</span><strong>{applied.fromDate||'All time'} → {applied.toDate||'now'}</strong>{applied.status&&<button onClick={()=>apply({...applied,status:''})}>{readableAdminStatus(applied.status)}<X size={12}/></button>}{applied.facet&&<button onClick={()=>apply({...applied,facet:''})}>{meta.facet}: {applied.facet}<X size={12}/></button>}{applied.search&&<button onClick={()=>apply({...applied,search:''})}>Search applied (private)<X size={12}/></button>}</div>
 <div className="ex-metrics-row"><article><p>Matching {meta.noun}</p><strong>{data.total.toLocaleString('en-IN')}</strong><small>Full filtered dataset, not just this page</small></article><article><p>Before status filter</p><strong>{data.populationTotal.toLocaleString('en-IN')}</strong><small>Dates, search and {dataset==='users'?'role':dataset==='chefs'?'city':'source'} filter still apply</small></article><article><p>Rows on this page</p><strong>{data.mode==='records'?data.rows.length:'—'}</strong><small>{data.mode==='records'?`Page ${cursors.length} · ${applied.sort} first`:'Add a purpose to open individual records'}</small></article></div>
 <section className="cr-panel"><div className="cr-section-heading"><div><p className="cr-eyebrow">Charts that lead somewhere</p><h2>Explore this selection</h2><p className="cr-muted">Click a status or creation period to filter the list below. Current status is not a historical status snapshot.</p></div><button className="cr-button" onClick={()=>apply({...applied,status:''},true)}>All statuses<ArrowRight size={15}/></button></div><div className="ex-chart-pair"><div><h3>Current status · Before status filter</h3><StatusChart result={data} selected={applied.status} onSelect={status=>apply({...applied,status},true)}/></div><div><h3>Created over time · Matching records</h3><TrendChart result={data} onSelect={(fromDate,toDate)=>apply({...applied,fromDate,toDate},true)}/></div></div></section>
 </>}
 <section ref={list} className="cr-panel ex-records" aria-labelledby="ex-records-title"><div className="cr-section-heading"><div><p className="cr-eyebrow">The records behind the numbers</p><h2 id="ex-records-title">{meta.title} list</h2><p className="cr-muted">Server-side pagination. There is no 20-record or recent-history cap.</p></div><div className="cr-actions"><button className="cr-button" disabled={!data||busy} onClick={exportSummary}><Download size={15}/>Export aggregates</button><button className="cr-button" onClick={()=>void copy(new URL(explorerHref(dataset,applied),window.location.origin).href,'View link copied. Search, city, audit purpose and paging position were excluded.')}><Copy size={15}/>Copy view link</button></div></div>
 <details className="ex-display-options"><summary><SlidersHorizontal size={15}/>Table display</summary><label><input type="checkbox" checked={compact} onChange={e=>setCompact(e.target.checked)}/>Compact rows</label><label><input type="checkbox" checked={contacts} onChange={e=>setContacts(e.target.checked)}/>Masked contacts / order value</label><label><input type="checkbox" checked={dates} onChange={e=>setDates(e.target.checked)}/>Created date</label></details>
 {data?.mode==='summary'?<div className="ex-locked"><ShieldCheck size={28}/><h3>Ready to inspect individual records?</h3><p>Enter an operational purpose above, then open the audited list. The charts already cover the complete filtered dataset.</p><button className="cr-button cr-primary" disabled={reason.trim().length<10||busy} onClick={()=>{setCursors([undefined]);void load(applied,reason,undefined,data.boundary);}}>Open record list<ArrowRight size={16}/></button></div>:data?.mode==='records'?<>
 {data.rows.length===0?<div className="cr-empty"><Search size={28}/><strong>No matching records on this page</strong><p>{data.total===0?'Broaden the filters or change the creation period.':'Records may have changed since the prior page. Refresh from page one.'}</p></div>:<div className="cr-table-scroll" tabIndex={0} role="region" aria-label={`${meta.title} records`}><table className={`cr-table ex-table ${compact?'ex-compact':''}`}><caption className="cr-sr-only">{data.total} matching {meta.noun}; {data.rows.length} on page {cursors.length}.</caption><thead><tr><th scope="col">{dataset==='orders'?'Order / kitchen':'Name / reference'}</th><th scope="col">Current status</th><th scope="col">{dataset==='users'?'Roles':dataset==='chefs'?'City':'Source'}</th>{contacts&&<th scope="col">{dataset==='orders'?'Order total · INR':'Masked contact'}</th>}{dates&&<th scope="col">Created · IST</th>}<th scope="col">Details</th></tr></thead><tbody>{data.rows.map(row=><tr key={row.id}><td><strong>{row.label||'Name unavailable'}</strong><code>{row.id.slice(0,8).toUpperCase()}</code></td><td><span className="cr-status">{readableAdminStatus(row.status)}</span></td><td>{dataset==='users'?row.roles.join(', ')||'No assigned role':dataset==='chefs'?row.city||'Not recorded':row.orderSource?readableAdminStatus(row.orderSource):'Not recorded'}</td>{contacts&&<td>{dataset==='orders'?row.amount?money(row.amount):'Not available':<>{row.phone||'Phone not recorded'}<small>{row.email||'Email not recorded'}</small></>}</td>}{dates&&<td>{formatAdminTimestamp(row.createdAt)}</td>}<td><button className="cr-button" onClick={()=>open(row)} aria-label={`View details for ${row.label||row.id}`}>View<ArrowRight size={13}/></button></td></tr>)}</tbody></table></div>}
 <div className="cr-pagination"><span>{data.total.toLocaleString('en-IN')} matching · {data.rows.length} on this page</span><button className="cr-button" onClick={()=>page(false)} disabled={busy||cursors.length<=1}>Previous</button><strong>Page {cursors.length}</strong><button className="cr-button" onClick={()=>page(true)} disabled={busy||!data.nextCursor}>Next</button></div>
 </>:!busy&&<p className="cr-empty">Load a report to view its record list.</p>}
 {data&&<p className="cr-footnote">Snapshot {formatAdminTimestamp(data.generatedAt)} · Correlation {data.correlationId}<br/>Paging keeps a fixed creation cutoff; status and profile updates can still change between requests. This is not a frozen historical database snapshot.</p>}
 </section>
 <p className="ex-feedback" role="status" aria-live="polite">{feedback}</p>
 <dialog ref={drawer} className="cr-dialog ex-drawer" aria-labelledby="ex-drawer-title" onCancel={()=>setSelected(null)} onClick={e=>{if(e.target===e.currentTarget)close();}}>
 {selected&&<div className="ex-drawer-inner"><div className="cr-dialog-heading"><p className="cr-eyebrow">{meta.title} · Record details</p><button className="cr-icon-button" onClick={close} aria-label="Close record details"><X size={20}/></button></div><h2 id="ex-drawer-title">{selected.label||'Record details'}</h2><span className="cr-status">{readableAdminStatus(selected.status)}</span>
 <dl className="ex-detail-grid">{[
 ['Record ID',selected.id],['Identity ID',selected.identityId],['Created',formatAdminTimestamp(selected.createdAt)],['Updated',formatAdminTimestamp(selected.updatedAt)],
 ['Phone (masked)',selected.phone],['Email (masked)',selected.email],['City',selected.city],['Roles',selected.roles.join(', ')||null],
 ['Order source',selected.orderSource],['Order total (not revenue)',selected.amount?`${selected.currency} ${money(selected.amount)}`:null],['Customer ID',selected.customerId],['Chef ID',selected.chefId],['Kitchen ID',selected.kitchenId],['Checkout ID',selected.checkoutId]
 ].filter(([,value])=>value!==null).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
 <button className="cr-button" onClick={()=>void copy(selected.id,'Record reference copied.')}><Copy size={15}/>Copy record ID</button>
 <section className="ex-drawer-actions"><h3>Continue in the right workspace</h3>{dataset==='orders'?<Link className="cr-button cr-primary" href={`/admin/operations?reference=${selected.id}`}>Open order investigation<ArrowRight size={15}/></Link>:dataset==='chefs'?<Link className="cr-button cr-primary" href={`/admin/chef-reviews/${selected.id}`}>Open chef application review<ArrowRight size={15}/></Link>:<Link className="cr-button cr-primary" href={`/admin/search?reference=${selected.identityId||selected.id}`}>Open audited identity lookup<ArrowRight size={15}/></Link>}
 <p className="cr-footnote">The destination rechecks permissions and may require its own audit purpose. Accounts without a customer profile may not have a directory case. No operation is executed by opening these links.</p></section></div>}
 </dialog>
 </div>;
}
function ArrowUp({d}:{d:boolean}){return d?<span className="ex-tab-dot"/>:<ArrowRight size={14}/>;}
