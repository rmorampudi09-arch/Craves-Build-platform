"use client";
import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "@/features/admin/shell/lib/admin-renewal";
import { ONBOARDING_LANGUAGES, type LearningContent, type OnboardingDetails } from "@/features/chef-onboarding/lib/chef-onboarding-v2-contract";

type Help={id:string;caseNumber:string;phoneNumber:string;details:OnboardingDetails;message:string;status:string;createdAt:string;applicationId?:string|null};
type HelpPage={items:Help[];nextCursor:string|null};
const input="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3 text-slate-950";
async function api(path:string,method="GET",body?:unknown) {
  const response=await adminFetch("/api/admin/chef-onboarding/"+path,{method,cache:"no-store",
    headers:body?{"Content-Type":"application/json"}:undefined,body:body?JSON.stringify(body):undefined});
  const result=await response.json().catch(()=>null);
  if(!response.ok)throw new Error(result?.message ?? "This operation could not be completed.");
  return result;
}
export function AdminChefOnboardingContent() {
  const [content,setContent]=useState<LearningContent[]>([]);
  const [help,setHelp]=useState<Help[]>([]);
  const [cursor,setCursor]=useState<string|null>(null);
  const [language,setLanguage]=useState("en");
  const [title,setTitle]=useState("");
  const [kind,setKind]=useState<"ARTICLE"|"VIDEO">("ARTICLE");
  const [body,setBody]=useState("");
  const [file,setFile]=useState<File|null>(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [playback,setPlayback]=useState<Record<string,string>>({});
  const load=useCallback(async()=> {
    const [articles,requests]=await Promise.all([api("content"),api("help")]);
    if(!Array.isArray(articles) || !Array.isArray(requests?.items)) throw new Error("Onboarding records could not be verified.");
    setContent(articles);setHelp((requests as HelpPage).items);setCursor((requests as HelpPage).nextCursor);
  },[]);
  useEffect(()=>{void load().catch(error=>setMessage(error instanceof Error?error.message:"Records unavailable."));},[load]);
  async function work(action:()=>Promise<void>) {
    if(busy)return;setBusy(true);setMessage("");
    try{await action();}catch(error){setMessage(error instanceof Error?error.message:"Operation unavailable.");}finally{setBusy(false);}
  }
  async function create() {
    if(kind==="VIDEO" && (!file || !["video/mp4","video/webm"].includes(file.type) || file.size>100*1024*1024))
      throw new Error("Choose an MP4 or WebM video up to 100 MB.");
    const ticket=await api("content","POST",{language,title,kind,body:kind==="ARTICLE"?body:null,
      contentType:file?.type ?? null,fileSizeBytes:file?.size ?? null}) as {content:LearningContent;uploadUrl:string|null};
    if(kind==="VIDEO") {
      if(!ticket.uploadUrl || !file)throw new Error("The secure video upload URL is unavailable.");
      const uploaded=await fetch(ticket.uploadUrl,{method:"PUT",headers:{"x-ms-blob-type":"BlockBlob","Content-Type":file.type,"If-None-Match":"*"},
        body:file,signal:AbortSignal.timeout(180000)});
      if(!uploaded.ok)throw new Error("Video upload did not finish. Check Azure Blob CORS and retry with a new upload.");
      await api("content/"+ticket.content.id+"/finalize","POST",{});
    }
    setTitle("");setBody("");setFile(null);await load();
    setMessage("Content saved as a draft. Preview it, then publish when ready.");
  }
  const openHelp=help.filter(item=>item.status!=="RESOLVED");
  return <div className="space-y-6">
    <section className="rounded-[30px] bg-white p-6 text-slate-950">
      <h2 className="text-2xl font-bold">Chef FSSAI help requests</h2>
      <p className="mt-2 font-bold" role="status">{openHelp.length===0?"No open requests.":`${openHelp.length}${cursor?"+":""} open ${openHelp.length===1?"request":"requests"} — call the chef, then mark it contacted or resolved.`}</p>
      <p className="mt-3 text-sm text-slate-600">The contact and kitchen details shown here are the saved snapshot from the request. Updates are recorded in an audit history.</p>
      <div className="mt-5 space-y-4">{[...openHelp,...help.filter(item=>item.status==="RESOLVED")].map(item=><article key={item.id} className="rounded-2xl border border-slate-200 p-4">
        <h3 className="font-bold">{item.details.firstName} {item.details.lastName} · {item.caseNumber}</h3>
        <p className="mt-2 text-sm">{item.phoneNumber} · {item.details.email} · {item.details.language}</p>
        <p className="mt-2 text-sm">DOB: {item.details.dateOfBirth} · Kitchen: {item.details.kitchenName || "Not yet saved"}</p>
        <p className="mt-2 text-sm">{[item.details.addressLine1,item.details.addressLine2,item.details.landmark,item.details.city,item.details.state,item.details.postalCode].filter(Boolean).join(", ")}</p>
        <p className="mt-2 whitespace-pre-wrap text-sm">{item.message}</p>
        <p className="mt-2 text-xs text-slate-600">{new Date(item.createdAt).toLocaleString("en-IN")} · {item.status}</p>
        {item.applicationId?<a className="mt-2 inline-block text-sm font-bold text-[#6930CA] underline" href={`/admin/chef-reviews/${item.applicationId}`}>Open this chef’s application</a>:<p className="mt-2 text-xs text-slate-600">No application saved yet (basic details only).</p>}
        <div className="mt-3 flex gap-2">{(["CONTACTED","RESOLVED"] as const).map(status=><button key={status} disabled={busy || item.status===status || item.status==="RESOLVED"} className="rounded-xl border px-4 py-2 text-sm font-bold disabled:opacity-50" onClick={()=>void work(async()=>{
          const updated=await api("help/"+item.id,"PUT",{status}) as Help;setHelp(current=>current.map(existing=>existing.id===updated.id?updated:existing));setMessage("Request status saved.");
        })}>{status==="CONTACTED"?"Mark contacted":"Mark resolved"}</button>)}</div>
      </article>)}</div>
      {cursor?<button disabled={busy} className="mt-5 rounded-xl border px-4 py-3 font-semibold" onClick={()=>void work(async()=>{
        const result=await api("help?cursor="+encodeURIComponent(cursor)) as HelpPage;
        setHelp(current=>[...current,...result.items]);setCursor(result.nextCursor);
      })}>Load older requests</button>:null}
    </section>
    <section className="rounded-[30px] bg-white p-6 text-slate-950">
      <h2 className="text-2xl font-bold">FSSAI learning articles and videos</h2>
      <p className="mt-3 text-sm text-slate-600">Create content in the selected language. Only published content appears in Chef onboarding. When a chef’s language has nothing published, the app shows the published English content and says so.</p>
      <form className="mt-5 space-y-4" onSubmit={event=>{event.preventDefault();void work(create);}}>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-bold">Language<select aria-label="Content language" value={language} disabled={busy} className={input} onChange={event=>setLanguage(event.target.value)}>
            {ONBOARDING_LANGUAGES.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
          <label className="text-sm font-bold">Content type<select value={kind} disabled={busy} className={input} onChange={event=>{setKind(event.target.value as "ARTICLE"|"VIDEO");setFile(null);}}>
            <option value="ARTICLE">Article</option><option value="VIDEO">Video</option></select></label>
        </div>
        <label className="block text-sm font-bold">Title<input required maxLength={160} disabled={busy} value={title} className={input} onChange={event=>setTitle(event.target.value)} /></label>
        {kind==="ARTICLE"?<div>
          <label className="block text-sm font-bold">Article<textarea required minLength={10} maxLength={20000} disabled={busy} value={body} className={input+" min-h-48"} onChange={event=>setBody(event.target.value)} /></label>
          <label className="mt-3 block text-sm">Or upload a plain-text article<input type="file" accept="text/plain,.txt" disabled={busy} className="mt-2 block" onChange={event=>{
            const article=event.target.files?.[0];event.target.value="";if(article)void work(async()=>{if(article.size>60000)throw new Error("Choose a text article within 20,000 characters.");const text=await article.text();if(text.length>20000)throw new Error("Article exceeds 20,000 characters.");setBody(text);});
          }} /></label>
        </div>:<label className="block text-sm font-bold">Video file<input type="file" accept="video/mp4,video/webm" required disabled={busy} className="mt-3 block" onChange={event=>setFile(event.target.files?.[0] ?? null)} /></label>}
        <button disabled={busy} type="submit" className="rounded-xl bg-[#6930CA] px-5 py-3 font-bold text-white disabled:opacity-50">{busy?"Saving…":"Save content draft"}</button>
      </form>
    </section>
    <section className="rounded-[30px] bg-white p-6 text-slate-950">
      <h2 className="text-2xl font-bold">Content publication</h2>
      <div className="mt-5 space-y-4">{content.map(item=><article key={item.id} className="rounded-2xl border border-slate-200 p-4">
        <h3 className="font-bold">{item.title}</h3><p className="mt-1 text-sm">{item.language} · {item.kind} · {item.published?"Published":item.ready?"Draft ready":"Upload incomplete"}</p>
        {item.kind==="ARTICLE"?<details className="mt-3"><summary className="cursor-pointer text-sm font-semibold">Preview article</summary><p className="mt-3 whitespace-pre-wrap text-sm leading-7">{item.body}</p></details>:<>
          {playback[item.id]?<video controls src={playback[item.id]} preload="metadata" className="mt-3 max-h-80 w-full rounded-xl" />:null}
          <button disabled={busy || !item.ready} className="mt-3 rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-50" onClick={()=>void work(async()=>{
            const result=await api("content/"+item.id+"/playback");setPlayback(current=>({...current,[item.id]:result.url}));
          })}>Preview video</button>
        </>}
        <button disabled={busy || !item.ready} className="ml-2 mt-3 rounded-xl bg-[#6930CA] px-4 py-2 text-sm font-bold text-white disabled:opacity-50" onClick={()=>void work(async()=>{
          await api("content/"+item.id+"/publication","PUT",{expectedVersion:item.version,published:!item.published});await load();setMessage(item.published?"Content unpublished.":"Content published.");
        })}>{item.published?"Unpublish":"Publish"}</button>
      </article>)}</div>
    </section>
    {message?<p role="status" className="rounded-2xl bg-[#FFF8EC] p-4 text-slate-950">{message}</p>:null}
  </div>;
}
