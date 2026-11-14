"use client";

import { adminFetch } from "@/features/admin/shell/lib/admin-renewal";
import { handedTo } from "@/features/admin/shell/lib/admin-handoff";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowRight, ChefHat, ClipboardCheck, Copy, FileCheck2, MapPin, Search, UserRound
} from "lucide-react";
import {
  parseAdminDirectorySearch, parseChefCase, parseCustomerCase,
  type AdminDirectoryHit, type AdminDirectorySearchResponse, type ChefCase, type CustomerCase
} from "@/features/admin/directory/lib/admin-directory-contract";
import { AdminCustomer360 } from "@/features/admin/customers/components/admin-customer-360";

type OpenCase = { kind: "CUSTOMER"; value: CustomerCase } | { kind: "CHEF"; value: ChefCase } | null;

function CopyValue({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setCopyFailed(false);
    } catch {
      setCopyFailed(true);
    }
    window.setTimeout(() => { setCopied(false); setCopyFailed(false); }, 1200);
  }
  return <button type="button" onClick={() => void copy()}
    className="inline-flex items-center gap-1 rounded-lg border border-[#e6dfeb] bg-white px-2 py-1 text-[11px] font-bold text-[#6930ca] hover:bg-[#f8f4ff]" aria-label={`Copy ${value}`}>
    <Copy size={12} />{copied ? "Copied" : copyFailed ? "Copy failed" : "Copy"}
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


export function AdminGlobalSearch({ initialReference = "" }: { initialReference?: string } = {}) {
  const [query,setQuery]=useState(()=>initialReference||handedTo("customers")); const [reason,setReason]=useState(""); const [result,setResult]=useState<AdminDirectorySearchResponse|null>(null); const [openCase,setOpenCase]=useState<OpenCase>(null); const [busy,setBusy]=useState(false); const [message,setMessage]=useState("");
  const canSearch=useMemo(()=>query.trim().length>=2&&reason.trim().length>=10&&!busy,[query,reason,busy]);

  async function call(payload: Record<string,string>) {
    const response=await adminFetch("/api/admin/directory",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload),cache:"no-store"});
    const body=await response.json().catch(()=>null);
    if(!response.ok) throw new Error(
      response.status===401?"Your administrator session expired. Sign in again.":
      response.status===403?"Administrator access is required.":
      response.status===404?"No record was found.":
      response.status===400?"Check the exact search value and provide an operational reason of at least 10 characters.":
      response.status===502?"The directory returned an invalid response. Try again or use the owning module.":
      "Directory search is temporarily unavailable."
    );
    return body;
  }
  async function runSearch(){if(!canSearch)return;setBusy(true);setMessage("");setOpenCase(null);try{const parsed=parseAdminDirectorySearch(await call({action:"search",query:query.trim(),reason:reason.trim()}));if(!parsed)throw new Error("Directory returned an invalid response.");setResult(parsed);if(!parsed.hits.length)setMessage("No customer or chef matched that exact value.");}catch(e){setMessage(e instanceof Error?e.message:"Search unavailable.");}finally{setBusy(false);}}
  async function open(hit:AdminDirectoryHit){setBusy(true);setMessage("");try{const raw=await call({action:hit.entityType==="CUSTOMER"?"customer-case":"chef-case",identityId:hit.identityId,reason:reason.trim()});if(hit.entityType==="CUSTOMER"){const parsed=parseCustomerCase(raw);if(!parsed)throw new Error("Customer case response was invalid.");setOpenCase({kind:"CUSTOMER",value:parsed});}else{const parsed=parseChefCase(raw);if(!parsed)throw new Error("Chef case response was invalid.");setOpenCase({kind:"CHEF",value:parsed});}}catch(e){setMessage(e instanceof Error?e.message:"Case unavailable.");}finally{setBusy(false);}}

  return <div className="space-y-7">
    <section className="cr-panel"><h2 className="max-w-4xl">Search by mobile, email, name or ID</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-[#5c6169]">Use the exact value. A customer opens with their orders, payments and refunds on this page, and your reason is recorded.</p>
      <div className="mt-7 grid gap-3 xl:grid-cols-[1.4fr_1fr_auto]"><label className="rounded-2xl border border-[#e7e7e5] bg-white p-3 text-[#251b35]"><span className="block text-xs font-semibold text-[#5c6169]">Find a customer or chef</span><div className="mt-1 flex items-center gap-2"><Search size={18} className="text-[#6930ca]"/><input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();void runSearch();}}} placeholder="Mobile, email, UUID or exact name" className="w-full bg-transparent py-1 text-sm font-bold outline-none" autoComplete="off"/></div></label><label className="rounded-2xl border border-[#e7e7e5] bg-white p-3 text-[#251b35]"><span className="block text-xs font-semibold text-[#5c6169]">Why are you looking? (needed, recorded)</span><input value={reason} onChange={e=>setReason(e.target.value)} placeholder="e.g. Customer support case 1842" className="mt-1 w-full bg-transparent py-1 text-sm font-bold outline-none" autoComplete="off"/></label><button disabled={!canSearch} onClick={()=>void runSearch()} className="cr-button cr-primary">{busy?"Working…":"Search"}</button></div>
    </section>

    {message?<div role="status" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-900">{message}</div>:null}
    {result && !openCase ? <section className="rounded-[28px] border border-[#e9e2ed] bg-white p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.15em] text-[#8f8198]">Matched records</p><h2 className="mt-1 text-xl font-black">{result.hits.length} result{result.hits.length===1?"":"s"}</h2></div><span className="rounded-full bg-[#f3edff] px-3 py-2 text-xs font-black text-[#6930ca]">{result.queryType}</span></div><div className="mt-5 divide-y divide-[#eee8f1]">{result.hits.map(hit=><div key={`${hit.entityType}-${hit.recordId}`} className="grid gap-3 py-4 md:grid-cols-[auto_1fr_auto] md:items-center"><div className={`grid h-11 w-11 place-items-center rounded-2xl ${hit.entityType==="CHEF"?"bg-[#fff0d3] text-[#986000]":"bg-[#eee7ff] text-[#6930ca]"}`}>{hit.entityType==="CHEF"?<ChefHat size={20}/>:<UserRound size={20}/>}</div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-black">{hit.displayName}</p><span className="rounded-full bg-[#f5f2f7] px-2 py-1 text-[10px] font-black">{hit.entityType}</span><span className="rounded-full bg-[#eaf8f0] px-2 py-1 text-[10px] font-black text-[#23724a]">{hit.status}</span></div><p className="mt-1 text-xs text-[#776b7f]">{hit.secondaryLabel} · matched {hit.matchField.toLowerCase()} {hit.maskedMatchValue}</p><div className="mt-2 flex items-center gap-2 text-[11px] text-[#988c9f]"><span className="truncate">{hit.identityId}</span><CopyValue value={hit.identityId}/></div></div><button onClick={()=>void open(hit)} disabled={reason.trim().length<10||busy} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#6930ca] px-4 py-3 text-xs font-black text-white disabled:opacity-40">{hit.entityType==="CUSTOMER"?"Open Customer 360":"Open audited case"}<ArrowRight size={14}/></button></div>)}</div></section>:null}
    {openCase?<section><button onClick={()=>setOpenCase(null)} className="mb-4 text-sm font-black text-[#6930ca]">← Back to matched records</button>{openCase.kind==="CUSTOMER"?<CustomerCaseView data={openCase.value} reason={reason.trim()}/>:<ChefCaseView data={openCase.value}/>}</section>:null}

    <p className="text-sm leading-6 text-[#5c6169]">Looking for one order, payment, refund or delivery? Use <Link className="underline" href="/admin/operations">Orders › Look up an order</Link>. To block or unblock an account, use <Link className="underline" href="/admin/accounts">Settings › Block or unblock</Link>.</p>

  </div>;
}
