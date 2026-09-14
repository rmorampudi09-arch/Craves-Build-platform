"use client";
import type { KeyboardEvent } from "react";
import type { ExplorerResult } from "@/lib/admin-explorer";
import { readableAdminStatus } from "@/lib/admin-navigation";
const tones=["#df2412","#286eca","#237149","#8a570b","#70544a","#686868","#aa3472","#42646d"];
function ringPath(start:number,end:number){
  const p=(r:number,a:number)=>[110+r*Math.cos(a-Math.PI/2),110+r*Math.sin(a-Math.PI/2)];
  const a=p(88,start),b=p(88,end),c=p(62,end),d=p(62,start),large=end-start>Math.PI?1:0;
  return `M${a.join(',')} A88 88 0 ${large} 1 ${b.join(',')} L${c.join(',')} A62 62 0 ${large} 0 ${d.join(',')} Z`;
}
export function StatusChart({result,onSelect,selected=""}:{result:ExplorerResult;onSelect:(status:string)=>void;selected?:string}){
  let progress=0;const populated=result.statuses.filter(s=>s.count>0);
  return <div className="ex-status-chart"><svg viewBox="0 0 220 220" className="ex-donut" aria-label="Current status distribution" role="group">
    <circle cx="110" cy="110" r="75" fill="none" stroke="#eadfdd" strokeWidth="26"/>
    {populated.map((s,i)=>{const start=progress;progress+=s.count/result.populationTotal*Math.PI*2;
      const gap=Math.min(.008,(progress-start)*.12);
      const label=`${readableAdminStatus(s.key)}: ${s.count.toLocaleString('en-IN')}. Open matching records.`;
      const props={fill:tones[i%tones.length],role:"button",tabIndex:0,"aria-label":label,"aria-pressed":selected===s.key,onClick:()=>onSelect(s.key),onKeyDown:(e:KeyboardEvent<SVGElement>)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(s.key);}}};
      return populated.length===1?<circle key={s.key} cx="110" cy="110" r="75" {...props} fill="none" stroke={tones[0]} strokeWidth="26"/>:<path key={s.key} d={ringPath(start+gap,progress-gap)} {...props}/>;
    })}
    <text x="110" y="108" textAnchor="middle" className="ex-ring-number">{new Intl.NumberFormat('en-IN',{notation:result.populationTotal>999999?'compact':'standard',maximumFractionDigits:1}).format(result.populationTotal)}</text><text x="110" y="130" textAnchor="middle" className="ex-ring-label">IN THIS WINDOW</text>
  </svg><div className="ex-legend">{result.statuses.map((s,i)=><button key={s.key} type="button" onClick={()=>onSelect(s.key)} aria-pressed={selected===s.key} className="ex-legend-item"><span className="ex-dot" style={{background:tones[i%tones.length]}}/><span>{readableAdminStatus(s.key)}</span><strong>{s.count.toLocaleString('en-IN')}</strong></button>)}
    {result.statuses.length===0&&<p className="cr-muted">No statuses in this window.</p>}</div></div>;
}
export function TrendChart({result,onSelect}:{result:ExplorerResult;onSelect:(from:string,to:string)=>void}){
  const max=Math.max(1,...result.trend.map(t=>t.count));
  return <><div className="ex-trend-scroll" tabIndex={0} role="region" aria-label="Creation trend; each bar opens its date range"><div className="ex-trend" style={{minWidth:Math.max(260,result.trend.length*38)}}>
    {result.trend.map(t=><button className="ex-trend-bar" key={t.fromDate} onClick={()=>onSelect(t.fromDate,t.toDate)} aria-label={`${t.fromDate} to ${t.toDate}: ${t.count} records. Open this period.`} title={`${t.fromDate} – ${t.toDate}: ${t.count}`}>
      <strong>{t.count.toLocaleString('en-IN')}</strong><span className="ex-bar-space"><span style={{height:`${100*t.count/max}%`}}/></span><small>{result.bucketUnit==='year'?t.fromDate.slice(0,4):result.bucketUnit==='month'?t.fromDate.slice(0,7):t.fromDate.slice(5)}</small>
    </button>)}
  </div></div>{result.trend.length===0&&<p className="cr-empty">No creation dates are available for this selection.</p>}<p className="cr-footnote">Created per {result.bucketUnit} · IST calendar boundaries · Click any bar to inspect records.</p></>;
}
