"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowRight, ChefHat, ClipboardCheck, Copy, CreditCard, FileCheck2, MapPin,
  PackageSearch, Search, ShieldCheck, Truck, UserRound, UsersRound
} from "lucide-react";
import {
  parseAdminDirectorySearch, parseChefCase, parseCustomerCase,
  type AdminDirectoryHit, type AdminDirectorySearchResponse, type ChefCase, type CustomerCase
} from "@/lib/admin-directory-contract";
import { AdminCustomer360 } from "@/components/admin-customer-360";
import { AdminOperationalInvestigator } from "@/components/admin-operational-investigator";

type OpenCase = { kind: "CUSTOMER"; value: CustomerCase } | { kind: "CHEF"; value: ChefCase } | null;

function CopyValue({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return <button type="button" onClick={() => void navigator.clipboard.writeText(value).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1200); })}
    className="inline-flex items-center gap-1 rounded-lg border border-[#e6dfeb] bg-white px-2 py-1 text-[11px] font-bold text-[#6930ca] hover:bg-[#f8f4ff]" aria-label={`Copy ${value}`}>
    <Copy size={12} />{copied ? "Copied" : "Copy"}
  </button>;
}

function Field({ label, value, copy = false }: { label: string; value: string | null | undefined; copy?: boolean }) {
  const shown = value || "Not recorded";
  return <div className="min-w-0 rounded-2xl border border-[#ece5ef] bg-[#fbf9fc] p-4">
    <p className="text-[10px] font-black uppercase tracking-[0.15em] text-[#91839a]">{label}</p>
    <div className="mt-2 flex items-start justify-between gap-2"><p className="break-words text-sm font-bold text-[#271d30]">{shown}</p>{copy && value ? <CopyValue value={value} /> : null}</div>
  </div>;
}

function CustomerCaseView({ data, reason }: { data: CustomerCase; reason: string }) {
  const p = data.profile;
  return <div className="space-y-5">
    <section className="rounded-[26px] bg-[#0b1426] p-6 text-white">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-[#f6b545]">Customer 360 case</p><h2 className="mt-2 text-2xl font-black">{p.firstName} {p.lastName}</h2><p className="mt-2 text-xs text-slate-300">Profile, addresses, orders, payments and refunds are opened under the same audited administrator reason.</p></div><span className="rounded-full bg-emerald-400/15 px-3 py-2 text-xs font-black text-emerald-300">ACTIVE PROFILE</span></div>
    </section>
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><Field label="Mobile" value={p.registeredPhoneNumber} copy/><Field label="Email" value={p.email} copy/><Field label="Identity ID" value={p.identityId} copy/><Field label="Profile ID" value={p.profileId} copy/></section>
    <section className="rounded-[26px] border border-[#e9e2ed] bg-white p-5"><div className="flex items-center gap-2"><MapPin size={18} className="text-[#6930ca]"/><h3 className="font-black">Saved delivery addresses</h3><span className="ml-auto rounded-full bg-[#f1ebff] px-2.5 py-1 text-xs font-black text-[#6930ca]">{data.addresses.length}</span></div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">{data.addresses.length ? data.addresses.map(address => <article key={address.addressId} className="rounded-2xl bg-[#fff8ec] p-4"><div className="flex items-center justify-between gap-3"><strong className="text-sm">{address.addressLabel}{address.defaultAddress ? " · Default" : ""}</strong><CopyValue value={address.addressId}/></div><p className="mt-2 text-sm font-semibold text-[#423548]">{[address.addressLine1,address.addressLine2,address.landmark,address.areaName,address.districtName,address.city,address.state,address.postalCode].filter(Boolean).join(", ")}</p><p className="mt-2 text-xs text-[#776b7f]">Recipient: {address.recipientName || "Not recorded"} · {address.contactPhoneNumber}</p></article>) : <p className="text-sm text-[#776b7f]">No active saved addresses.</p>}</div>
    </section>
    <AdminCustomer360 identityId={p.identityId} reason={reason}/>
  </div>;
}

function ChefCaseView({ data }: { data: ChefCase }) {
  const a = data.application;
  return <div className="space-y-5">
    <section className="rounded-[26px] bg-[#0b1426] p-6 text-white"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-[#f6b545]">Chef case</p><h2 className="mt-2 text-2xl font-black">{a.firstName} {a.lastName}</h2><p className="mt-2 text-xs text-slate-300">Onboarding, document metadata and decision history from User/Chef Service.</p></div><span className="rounded-full bg-[#6930ca] px-3 py-2 text-xs font-black">{a.status}</span></div></section>
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><Field label="Mobile" value={a.phoneNumber} copy/><Field label="Email" value={a.email} copy/><Field label="Identity ID" value={a.identityId} copy/><Field label="Application ID" value={a.applicationId} copy/></section>
    <section className="grid gap-5 xl:grid-cols-2"><article className="rounded-[26px] border border-[#e9e2ed] bg-white p-5"><div className="flex items-center gap-2"><FileCheck2 size={18} className="text-[#6930ca]"/><h3 className="font-black">KYC document metadata</h3></div><div className="mt-4 space-y-3">{data.documents.length ? data.documents.map(doc => <div key={doc.documentId} className="rounded-2xl bg-[#f8f6fa] p-4"><div className="flex items-center justify-between"><strong className="text-sm">{doc.documentType.replaceAll("_"," ")}</strong><span className="text-xs font-black text-emerald-700">{doc.status}</span></div><p className="mt-1 break-all text-xs text-[#776b7f]">{doc.originalFileName} · {(doc.fileSizeBytes/1024).toFixed(1)} KB</p></div>) : <p className="text-sm text-[#776b7f]">No KYC metadata recorded.</p>}</div></article>
      <article className="rounded-[26px] border border-[#e9e2ed] bg-white p-5"><div className="flex items-center gap-2"><ClipboardCheck size={18} className="text-[#6930ca]"/><h3 className="font-black">Decision history</h3></div><div className="mt-4 space-y-3">{data.decisionHistory.length ? data.decisionHistory.map(item => <div key={item.auditId} className="border-l-2 border-[#f6b545] pl-4"><p className="text-sm font-black">{item.decision}</p><p className="mt-1 text-xs text-[#776b7f]">{item.reason || "No reason recorded"}</p><p className="mt-1 text-[11px] text-[#9a8fa1]">{item.createdAt ? new Date(item.createdAt).toLocaleString("en-IN") : "Time not recorded"}</p></div>) : <p className="text-sm text-[#776b7f]">No review decisions recorded.</p>}</div></article></section>
    <section className="rounded-[26px] border border-[#e9e2ed] bg-[#fff8ec] p-5"><h3 className="font-black">Registered address</h3><p className="mt-2 text-sm text-[#4b3c50]">{[a.addressLine1,a.addressLine2,a.landmark,a.city,a.state,a.postalCode].filter(Boolean).join(", ")}</p></section>
    <RelatedOperations identityId={a.identityId}/>
  </div>;
}

function RelatedOperations({ identityId }: { identityId: string }) {
  return <section className="rounded-[26px] border border-[#e9e2ed] bg-white p-5"><p className="text-[10px] font-black uppercase tracking-[0.15em] text-[#91839a]">Continue investigation</p><h3 className="mt-2 font-black">Related operational tools</h3><p className="mt-1 text-xs text-[#776b7f]">Use the copied identity ID to correlate with owning services. Operational evidence remains independently authorized and audited.</p><div className="mt-4 flex flex-wrap gap-2"><CopyValue value={identityId}/>{[["Orders / payments / refunds","/admin/operations"],["Account security","/admin/accounts"],["Notifications","/admin/notifications"]].map(([label,href]) => <Link key={href} href={href} className="inline-flex items-center gap-2 rounded-xl bg-[#0b1426] px-3 py-2 text-xs font-black text-white">{label}<ArrowRight size={13}/></Link>)}</div></section>;
}

const searchable = [
  [UserRound,"Customer mobile","Exact registered mobile"], [ChefHat,"Chef mobile","Exact application mobile"], [UsersRound,"Email / name","Exact email or exact name"], [ShieldCheck,"Customer / chef UUID","Identity or profile/application ID"]
] as const;

export function AdminGlobalSearch() {
  const [query,setQuery]=useState(""); const [reason,setReason]=useState(""); const [result,setResult]=useState<AdminDirectorySearchResponse|null>(null); const [openCase,setOpenCase]=useState<OpenCase>(null); const [busy,setBusy]=useState(false); const [message,setMessage]=useState("");
  const canSearch=useMemo(()=>query.trim().length>=2&&reason.trim().length>=10&&!busy,[query,reason,busy]);

  async function call(payload: Record<string,string>) {
    const response=await fetch("/api/admin/directory",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload),cache:"no-store"});
    const body=await response.json().catch(()=>null); if(!response.ok) throw new Error(response.status===403?"Administrator access is required.":response.status===404?"No record was found.":"Directory request could not be completed."); return body;
  }
  async function runSearch(){if(!canSearch)return;setBusy(true);setMessage("");setOpenCase(null);try{const parsed=parseAdminDirectorySearch(await call({action:"search",query:query.trim(),reason:reason.trim()}));if(!parsed)throw new Error("Directory returned an invalid response.");setResult(parsed);if(!parsed.hits.length)setMessage("No customer or chef matched that exact value.");}catch(e){setMessage(e instanceof Error?e.message:"Search unavailable.");}finally{setBusy(false);}}
  async function open(hit:AdminDirectoryHit){setBusy(true);setMessage("");try{const raw=await call({action:hit.entityType==="CUSTOMER"?"customer-case":"chef-case",identityId:hit.identityId,reason:reason.trim()});if(hit.entityType==="CUSTOMER"){const parsed=parseCustomerCase(raw);if(!parsed)throw new Error("Customer case response was invalid.");setOpenCase({kind:"CUSTOMER",value:parsed});}else{const parsed=parseChefCase(raw);if(!parsed)throw new Error("Chef case response was invalid.");setOpenCase({kind:"CHEF",value:parsed});}}catch(e){setMessage(e instanceof Error?e.message:"Case unavailable.");}finally{setBusy(false);}}

  return <div className="space-y-7">
    <section className="overflow-hidden rounded-[32px] bg-[#0b1426] p-6 text-white shadow-[0_28px_80px_-46px_rgba(11,20,38,.8)] sm:p-8"><p className="text-xs font-black uppercase tracking-[0.2em] text-[#f6b545]">Global admin search</p><h1 className="mt-3 max-w-4xl text-3xl font-black sm:text-4xl">Start with what the customer gives you.</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">Mobile, email, customer/chef ID or exact name finds the person. A customer case automatically expands into the same-page Customer 360 journey; standalone order, payment, refund and delivery references remain available below.</p>
      <div className="mt-7 grid gap-3 xl:grid-cols-[1.4fr_1fr_auto]"><label className="rounded-2xl bg-white p-3 text-[#251b35]"><span className="block text-[10px] font-black uppercase tracking-[.14em] text-[#8f8198]">Find a customer or chef</span><div className="mt-1 flex items-center gap-2"><Search size={18} className="text-[#6930ca]"/><input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();void runSearch();}}} placeholder="Mobile, email, UUID or exact name" className="w-full bg-transparent py-1 text-sm font-bold outline-none" autoComplete="off"/></div></label><label className="rounded-2xl bg-white p-3 text-[#251b35]"><span className="block text-[10px] font-black uppercase tracking-[.14em] text-[#8f8198]">Operational reason · required</span><input value={reason} onChange={e=>setReason(e.target.value)} placeholder="e.g. Customer support case 1842" className="mt-1 w-full bg-transparent py-1 text-sm font-bold outline-none" autoComplete="off"/></label><button disabled={!canSearch} onClick={()=>void runSearch()} className="rounded-2xl bg-[#f6b545] px-6 py-4 text-sm font-black text-[#0b1426] disabled:cursor-not-allowed disabled:opacity-40">{busy?"Working…":"Search"}</button></div>
    </section>

    {!result && !openCase ? <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{searchable.map(([Icon,title,note])=><article key={title} className="rounded-[24px] border border-[#e9e2ed] bg-white p-5"><div className="grid h-10 w-10 place-items-center rounded-xl bg-[#eee7ff] text-[#6930ca]"><Icon size={19}/></div><h2 className="mt-4 text-sm font-black">{title}</h2><p className="mt-1 text-xs text-[#817487]">{note}</p></article>)}</section>:null}
    {message?<div role="status" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-900">{message}</div>:null}
    {result && !openCase ? <section className="rounded-[28px] border border-[#e9e2ed] bg-white p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.15em] text-[#8f8198]">Matched records</p><h2 className="mt-1 text-xl font-black">{result.hits.length} result{result.hits.length===1?"":"s"}</h2></div><span className="rounded-full bg-[#f3edff] px-3 py-2 text-xs font-black text-[#6930ca]">{result.queryType}</span></div><div className="mt-5 divide-y divide-[#eee8f1]">{result.hits.map(hit=><div key={`${hit.entityType}-${hit.recordId}`} className="grid gap-3 py-4 md:grid-cols-[auto_1fr_auto] md:items-center"><div className={`grid h-11 w-11 place-items-center rounded-2xl ${hit.entityType==="CHEF"?"bg-[#fff0d3] text-[#986000]":"bg-[#eee7ff] text-[#6930ca]"}`}>{hit.entityType==="CHEF"?<ChefHat size={20}/>:<UserRound size={20}/>}</div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-black">{hit.displayName}</p><span className="rounded-full bg-[#f5f2f7] px-2 py-1 text-[10px] font-black">{hit.entityType}</span><span className="rounded-full bg-[#eaf8f0] px-2 py-1 text-[10px] font-black text-[#23724a]">{hit.status}</span></div><p className="mt-1 text-xs text-[#776b7f]">{hit.secondaryLabel} · matched {hit.matchField.toLowerCase()} {hit.maskedMatchValue}</p><div className="mt-2 flex items-center gap-2 text-[11px] text-[#988c9f]"><span className="truncate">{hit.identityId}</span><CopyValue value={hit.identityId}/></div></div><button onClick={()=>void open(hit)} disabled={reason.trim().length<10||busy} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#6930ca] px-4 py-3 text-xs font-black text-white disabled:opacity-40">{hit.entityType==="CUSTOMER"?"Open Customer 360":"Open audited case"}<ArrowRight size={14}/></button></div>)}</div></section>:null}
    {openCase?<section><button onClick={()=>setOpenCase(null)} className="mb-4 text-sm font-black text-[#6930ca]">← Back to matched records</button>{openCase.kind==="CUSTOMER"?<CustomerCaseView data={openCase.value} reason={reason.trim()}/>:<ChefCaseView data={openCase.value}/>}</section>:null}

    <section className="rounded-[30px] border border-[#ded3e5] bg-[#fff8ec] p-5 sm:p-7"><div className="mb-5 flex items-start gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#0b1426] text-[#f6b545]"><PackageSearch size={20}/></div><div><p className="text-xs font-black uppercase tracking-[.15em] text-[#8d7150]">Operational reference search</p><h2 className="mt-1 text-xl font-black">Order, payment, refund or delivery ID</h2><p className="mt-1 text-xs text-[#7e6d5b]">Existing evidence APIs remain read-only and audited. Select the reference type so one UUID never silently probes unrelated systems.</p></div></div><AdminOperationalInvestigator/></section>

    <section className="grid gap-3 md:grid-cols-3">{[[CreditCard,"Payments & refunds","Trace provider attempts and refund state","/admin/operations"],[Truck,"Delivery operations","Trace command, provider and job state","/admin/operations"],[ShieldCheck,"Account security","Use controlled account recovery tools","/admin/accounts"]].map(([Icon,title,note,href])=><Link key={title as string} href={href as string} className="rounded-[22px] border border-[#e9e2ed] bg-white p-5 transition hover:-translate-y-0.5 hover:border-[#c9b5e5]"><Icon size={19} className="text-[#6930ca]"/><p className="mt-3 text-sm font-black">{title as string}</p><p className="mt-1 text-xs text-[#817487]">{note as string}</p></Link>)}</section>
  </div>;
}
