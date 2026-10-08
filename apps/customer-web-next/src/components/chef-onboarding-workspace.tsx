"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/buttons/button";
import { EmailVerificationPanel } from "@/components/auth/EmailVerificationPanel";
import { AddressMapPicker } from "@/components/location/AddressMapPicker";
import { chefEmailEligible, type EmailVerificationState } from "@/lib/email-verification-contract";
import { reverseGeocodeCurrentLocation } from "@/services/location/reverseGeocode";
import {
  EMPTY_ONBOARDING, ONBOARDING_LANGUAGES, PROOF_OPTIONS, parseOnboardingState, proofNeedsBack,
  type LearningContent, type OnboardingDetails, type OnboardingState, type OnboardingStep, type ProofKind,
} from "@/lib/chef-onboarding-v2-contract";

const inputClass="mt-2 w-full rounded-xl border border-[#E5E7EB] bg-white px-4 py-3 text-base text-[#1A1A1A] focus:border-[#F62E18] focus:outline-none focus:ring-2 focus:ring-[#F62E18]/10 disabled:bg-[#F1F3F5]";
const stepNames: Record<OnboardingStep,string>={personal:"Personal details",kitchen:"Kitchen details","kitchen-photos":"Kitchen photos",fssai:"FSSAI registration",documents:"Your document",review:"Review your application",waiting:"Application under review",legacy:"Your application"};
async function api(path:string,method="GET",body?:unknown):Promise<unknown> {
  const response=await fetch(path,{method,cache:"no-store",credentials:"same-origin",
    headers:body?{"Content-Type":"application/json"}:undefined,body:body?JSON.stringify(body):undefined,
    signal:AbortSignal.timeout(45000)});
  const raw:unknown=await response.json().catch(()=>null);
  if(!response.ok) {
    const error=raw && typeof raw==="object"?raw as {message?:string}:{};
    throw new Error(response.status===401?"Sign in to continue your Chef application.":error.message ?? "We could not complete this step. Your saved progress is preserved.");
  }
  return raw;
}
export function ChefOnboardingWorkspace({fallback}:{fallback:ReactNode}) {
  const [state,setState]=useState<OnboardingState|null>(null);
  const [details,setDetails]=useState<OnboardingDetails>({...EMPTY_ONBOARDING});
  const [step,setStep]=useState<OnboardingStep>("personal");
  const [emailState,setEmailState]=useState<EmailVerificationState|null>(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [loading,setLoading]=useState(true);
  const [signedOut,setSignedOut]=useState(false);
  const [content,setContent]=useState<LearningContent[]>([]);
  const [contentError,setContentError]=useState("");
  const [contentLoading,setContentLoading]=useState(false);
  const [fssaiOption,setFssaiOption]=useState<"licence"|"learn"|"help">("licence");
  const [helpMessage,setHelpMessage]=useState("");
  const [playback,setPlayback]=useState<Record<string,string>>({});
  const helpKey=useRef<string|null>(null);

  function accept(raw:unknown,target?:OnboardingStep) {
    const next=parseOnboardingState(raw);
    if(!next) throw new Error("We could not verify the saved application. Please reload.");
    setState(next); setDetails(next.details ?? {...EMPTY_ONBOARDING}); setStep(target ?? next.resumeStep);
    return next;
  }
  const load=useCallback(async()=> {
    setLoading(true);setMessage("");
    try {
      const response=await fetch("/api/chef/onboarding",{cache:"no-store",signal:AbortSignal.timeout(45000)});
      if(response.status===401){setSignedOut(true);return;}
      if(!response.ok) throw new Error("We could not load your saved Chef application. Please retry.");
      accept(await response.json());setSignedOut(false);
    } catch(error){setMessage(error instanceof Error?error.message:"Chef application is unavailable.");}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void load();},[load]);
  useEffect(()=>{
    if(step!=="fssai" || !state?.enabled || state.legacy) return;
    const controller=new AbortController();setContentLoading(true);setContentError("");setContent([]);
    void fetch("/api/chef/onboarding/content?language="+encodeURIComponent(details.language),{cache:"no-store",signal:controller.signal})
      .then(async response=>{if(!response.ok)throw new Error("Learning content is temporarily unavailable. You can still contact Craves.");const result:unknown=await response.json();if(!Array.isArray(result))throw new Error("Learning content could not be verified.");if(!controller.signal.aborted)setContent(result as LearningContent[]);})
      .catch(error=>{if(!controller.signal.aborted)setContentError(error instanceof Error?error.message:"Learning content is unavailable.");})
      .finally(()=>{if(!controller.signal.aborted)setContentLoading(false);});
    return()=>controller.abort();
  },[step,details.language,state?.enabled,state?.legacy]);
  function field<K extends keyof OnboardingDetails>(key:K,value:OnboardingDetails[K]) {
    setDetails(current=>({...current,[key]:value}));setMessage("");
  }
  async function save(target?:OnboardingStep):Promise<OnboardingState> {
    if(!state) throw new Error("Reload your application.");
    return accept(await api("/api/chef/onboarding","PUT",{expectedVersion:state.version,details}),target);
  }
  async function work(action:()=>Promise<unknown>) {
    if(busy)return;setBusy(true);setMessage("");
    try {await action();}
    catch(error){setMessage(error instanceof Error?error.message:"This step could not be completed. Please retry.");}
    finally{setBusy(false);}
  }
  async function locate() {
    const position=await new Promise<GeolocationPosition>((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{timeout:15000,enableHighAccuracy:true}));
    const latitude=position.coords.latitude,longitude=position.coords.longitude;
    const address=await reverseGeocodeCurrentLocation(latitude,longitude);
    setDetails(current=>({...current,latitude,longitude,addressLine1:address.houseNumber||address.formattedAddress,
      addressLine2:[address.street,address.area].filter(Boolean).join(", "),city:address.city||current.city,
      state:address.state||current.state,postalCode:address.postalCode||current.postalCode}));
  }
  async function upload(type:string,file:File) {
    if(type==="FSSAI_LICENSE") await save("fssai");
    const form=new FormData();form.set("documentType",type);form.set("file",file);
    const response=await fetch("/api/chef/application/proof-files",{method:"POST",body:form,signal:AbortSignal.timeout(45000)});
    const raw:unknown=await response.json().catch(()=>null);
    if(!response.ok) throw new Error(raw && typeof raw==="object" && "message" in raw ? String(raw.message):"Upload failed. Please select the file again.");
    accept(await api("/api/chef/onboarding"));
  }
  function fileSlot(type:string,label:string,photo=false) {
    const document=state?.documents.find(d=>d.documentType===type);
    return <div className="rounded-2xl border border-[#E5E7EB] p-4" key={type}>
      <label className="block text-sm font-semibold">{label}
        <input aria-label={label} type="file" accept={photo?"image/jpeg,image/png":"image/jpeg,image/png,application/pdf"}
          disabled={busy || document?.status==="APPROVED"} className="mt-3 block w-full text-sm"
          onChange={event=>{const file=event.target.files?.[0];event.target.value="";if(file)void work(()=>upload(type,file));}} />
      </label>
      <p className="mt-2 text-xs text-[#6B6B6B]">{document?document.originalFileName+" · "+document.status:"Choose a clear "+(photo?"JPG or PNG photo":"JPG, PNG or PDF file")+" (up to 10 MB)."}</p>
      {document?.reviewReason?<p className="mt-2 text-sm text-[#F62E18]">{document.reviewReason}</p>:null}
    </div>;
  }
  function textField(key:keyof OnboardingDetails,label:string,type="text",required=false,maxLength=255) {
    return <label className="block text-sm font-semibold" key={key}>{label}
      <input aria-label={label} type={type} required={required} maxLength={maxLength}
        value={String(details[key] ?? "")} disabled={busy} className={inputClass}
        onChange={event=>field(key,event.target.value as never)} />
    </label>;
  }
  if(signedOut || state?.legacy || state && !state.enabled) return <>{fallback}</>;
  if(loading) return <section aria-busy="true" className="rounded-3xl border border-[#E5E7EB] bg-white p-7">Loading your saved application…</section>;
  if(!state) return <section className="rounded-3xl border border-[#E5E7EB] bg-white p-7"><p role="alert">{message}</p><Button className="mt-4" onClick={()=>void load()}>Try again</Button></section>;
  const proofLabel=PROOF_OPTIONS.find(([key])=>key===details.proofKind)?.[1] ?? "Selected document";
  return <section className="chef-step rounded-3xl border border-[#E5E7EB] bg-white p-6 text-[#1A1A1A] md:p-9" aria-busy={busy}>
    <p className="text-sm font-semibold text-[#F62E18]">Become a Craves Chef</p>
    <h1 className="mt-2 text-3xl font-bold">{stepNames[step]}</h1>
    <p className="mt-3 text-sm text-[#6B6B6B]">Your saved progress stays with your Craves account.</p>
    {state.application.rejectionReason?<p role="alert" className="mt-4 rounded-xl bg-red-50 p-4 text-sm">{state.application.rejectionReason}</p>:null}
    {step==="personal"?<form className="mt-6 space-y-5" onSubmit={event=>{event.preventDefault();void work(()=>save());}}>
      <div className="grid gap-4 sm:grid-cols-2">{textField("firstName","First name","text",true,100)}{textField("lastName","Last name","text",true,100)}
        {textField("dateOfBirth","Date of birth","date",true)}</div>
      <label className="block text-sm font-semibold">Verified phone number<input aria-label="Verified phone number" value={state.phoneNumber} readOnly className={inputClass} /></label>
      <EmailVerificationPanel required onStateChange={next=>{setEmailState(next);if(next?.email)field("email",next.email);}} />
      <Button type="submit" className="w-full" disabled={busy || !chefEmailEligible(emailState)}>Save and continue</Button>
    </form>:null}
    {step==="kitchen"?<form className="mt-6 space-y-5" onSubmit={event=>{event.preventDefault();void work(async()=>{
      if(details.latitude===null || details.longitude===null)throw new Error("Choose your kitchen location on the map.");
      await save();
    });}}>
      {textField("kitchenName","Kitchen name","text",true,160)}{textField("kitchenDescription","Kitchen description","text",false,1000)}
      <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={()=>void work(locate)}>Use my current location</Button>
      {details.latitude!==null && details.longitude!==null?<AddressMapPicker latitude={details.latitude} longitude={details.longitude}
        disabled={busy} onUseCurrentLocation={()=>void work(locate)} onCenterChange={next=>{field("latitude",next.latitude);field("longitude",next.longitude);}} />:null}
      <div className="grid gap-4 sm:grid-cols-2">{textField("addressLine1","House / building","text",true)}
        {textField("addressLine2","Street / area")}{textField("landmark","Landmark")}
        {textField("city","City","text",true,120)}{textField("state","State","text",true,120)}{textField("postalCode","Pincode","text",true,6)}
        <label className="text-sm font-semibold">Latitude<input aria-label="Latitude" type="number" step="any" min={-90} max={90} required className={inputClass} value={details.latitude ?? ""} onChange={event=>field("latitude",event.target.value===""?null:Number(event.target.value))} /></label>
        <label className="text-sm font-semibold">Longitude<input aria-label="Longitude" type="number" step="any" min={-180} max={180} required className={inputClass} value={details.longitude ?? ""} onChange={event=>field("longitude",event.target.value===""?null:Number(event.target.value))} /></label>
      </div>
      <Button type="submit" className="w-full" disabled={busy}>Save kitchen and continue</Button>
      <Button type="button" variant="ghost" className="w-full" disabled={busy} onClick={()=>setStep("personal")}>Back to personal details</Button>
    </form>:null}
    {step==="kitchen-photos"?<div className="mt-6 space-y-4">
      <p className="text-sm text-[#6B6B6B]">Upload two clear photos of your kitchen.</p>
      {fileSlot("KITCHEN_PHOTO_1","Kitchen photo 1",true)}{fileSlot("KITCHEN_PHOTO_2","Kitchen photo 2",true)}
      <Button variant="ghost" className="w-full" disabled={busy} onClick={()=>setStep("kitchen")}>Back to kitchen details</Button>
    </div>:null}
    {step==="fssai"?<div className="mt-6 space-y-5">
      <p className="text-sm leading-6">Upload your FSSAI registration or licence. If you do not have it yet, learn how to apply or request help. Your next Chef login will return here until this step is complete.</p>
      <div className="grid gap-2 sm:grid-cols-3">{([["licence","I have FSSAI"],["learn","Learn how to apply"],["help","Get Craves help"]] as const).map(([key,label])=><Button key={key} variant={fssaiOption===key?"default":"outline"} disabled={busy} onClick={()=>setFssaiOption(key)}>{label}</Button>)}</div>
      <label className="block text-sm font-semibold">Preferred language<select aria-label="Preferred language" value={details.language} disabled={busy} className={inputClass} onChange={event=>field("language",event.target.value)}>
        {ONBOARDING_LANGUAGES.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
      {fssaiOption==="licence"?<div className="space-y-4">{textField("fssaiNumber","FSSAI registration / licence number","text",false,14)}
        {fileSlot("FSSAI_LICENSE","FSSAI registration / licence document")}
        <Button className="w-full" disabled={busy} onClick={()=>void work(()=>save())}>Save and continue</Button>
      </div>:null}
      {fssaiOption==="learn"?<div className="space-y-4">
        {contentLoading?<p role="status">Loading learning content…</p>:null}
        {contentError?<p role="alert">{contentError}</p>:null}
        {!contentLoading && !contentError && !content.length?<p className="rounded-xl bg-[#F1F3F5] p-4 text-sm">No articles or videos have been published in this language yet. Choose another language or request Craves help.</p>:null}
        {content.map(item=><article key={item.id} className="rounded-2xl border border-[#E5E7EB] p-5" lang={item.language}>
          <h2 className="text-lg font-bold">{item.title}</h2>
          {item.kind==="ARTICLE"?<p className="mt-3 whitespace-pre-wrap text-sm leading-7">{item.body}</p>:<div className="mt-3">
            {playback[item.id]?<video controls preload="metadata" src={playback[item.id]} className="w-full rounded-xl" />:null}
            <Button variant="outline" disabled={busy} className="mt-3" onClick={()=>void work(async()=>{const result=await api("/api/chef/onboarding/content/"+item.id+"/playback") as {url:string};setPlayback(current=>({...current,[item.id]:result.url}));})}>{playback[item.id]?"Refresh video access":"Watch video"}</Button>
          </div>}
        </article>)}
      </div>:null}
      <div className="rounded-2xl bg-[#F1F3F5] p-5 text-sm"><p className="font-semibold">Craves support</p>
        <a className="mt-2 block text-[#F62E18]" href={"tel:"+state.supportPhone}>{state.supportPhone}</a>
        <a className="mt-2 block text-[#F62E18]" href={"mailto:"+state.supportEmail}>{state.supportEmail}</a>
      </div>
      {fssaiOption==="help"?<form className="space-y-4" onSubmit={event=>{event.preventDefault();void work(async()=>{
        await save("fssai");helpKey.current ??=crypto.randomUUID();
        const result=await api("/api/chef/onboarding/help","POST",{requestKey:helpKey.current,message:helpMessage}) as {caseNumber:string};
        setMessage("Your help request is saved. Reference: "+result.caseNumber);
      });}}>
        <p className="text-sm text-[#6B6B6B]">Your saved name, verified contact details, kitchen details and preferred language will accompany this request.</p>
        <label className="block text-sm font-semibold">What help do you need?<textarea aria-label="What help do you need?" minLength={3} maxLength={2000} required value={helpMessage} disabled={busy} className={inputClass} onChange={event=>setHelpMessage(event.target.value)} /></label>
        <Button type="submit" className="w-full" disabled={busy}>Request help from Craves</Button>
      </form>:null}
      <Button variant="outline" className="w-full" disabled={busy} onClick={()=>void work(async()=>{await save("fssai");setMessage("Progress saved. You can continue from this FSSAI step on your next Chef login.");})}>Save progress for later</Button>
    </div>:null}
    {step==="documents"?<div className="mt-6 space-y-4">
      <label className="block text-sm font-semibold">Choose your document<select aria-label="Choose your document" value={details.proofKind ?? ""} disabled={busy || state.documents.some(d=>d.documentType==="GOVERNMENT_ID_FRONT"||d.documentType==="GOVERNMENT_ID_BACK")} className={inputClass} onChange={event=>field("proofKind",event.target.value as ProofKind)}>
        <option value="" disabled>Select a document</option>{PROOF_OPTIONS.map(([key,label])=><option key={key} value={key}>{label}</option>)}
      </select></label>
      {details.proofKind==="OTHER_GOVERNMENT_ID"?textField("otherGovernmentId","Government ID name","text",true,80):null}
      <p className="text-sm text-[#6B6B6B]">PAN card and bank statement need one file. Aadhaar and other government IDs need front and back.</p>
      <Button variant="outline" disabled={busy || !details.proofKind} onClick={()=>void work(()=>save("documents"))}>Save document choice</Button>
      {details.proofKind && state.details?.proofKind===details.proofKind?<>
        {fileSlot("GOVERNMENT_ID_FRONT",proofLabel+(proofNeedsBack(details.proofKind)?" — front":""))}
        {proofNeedsBack(details.proofKind)?fileSlot("GOVERNMENT_ID_BACK",proofLabel+" — back"):null}
      </>:null}
    </div>:null}
    {step==="review"?<div className="mt-6 space-y-4">
      <p className="font-semibold">{details.firstName} {details.lastName}</p><p className="text-sm">{details.kitchenName} · {details.city}, {details.state}</p>
      <p className="text-sm">{proofLabel} · Two kitchen photos · FSSAI document</p>
      <Button className="w-full" disabled={busy} onClick={()=>void work(async()=>accept(await api("/api/chef/onboarding/submit","POST",{expectedVersion:state.version})))}>Submit for admin review</Button>
      <Button variant="outline" className="w-full" disabled={busy} onClick={()=>setStep("kitchen")}>Review saved kitchen details</Button>
    </div>:null}
    {step==="waiting"?<div className="mt-6 space-y-4"><p>Your submitted details and documents are with Craves for review.</p>
      <Button disabled={busy} className="w-full" onClick={()=>void load()}>Check status</Button><Link href="/home" className="block text-center text-sm text-[#F62E18]">Switch to Customer Mode</Link>
    </div>:null}
    {message?<p role="status" className="mt-5 rounded-xl bg-[#F1F3F5] p-4 text-sm">{message}</p>:null}
  </section>;
}
