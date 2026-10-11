"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
const Context=createContext<{reason:string;setReason:(value:string)=>void}>({reason:"",setReason:()=>{}});
/** Memory-only purpose. The admin layout unmounts this provider when identity ends. */
export function AdminExplorerSession({children}:{children:ReactNode}) {
  const [reason,setReason]=useState("");return <Context.Provider value={{reason,setReason}}>{children}</Context.Provider>;
}
export function useExplorerSession(){return useContext(Context);}
export function ExplorerPurpose(){
  const {reason,setReason}=useExplorerSession();
  return <label className="ex-purpose"><span>Purpose for opening records <small>Recorded in the access audit</small></span>
    <input value={reason} onChange={e=>setReason(e.target.value.replace(/[\r\n]/g," "))} maxLength={500} placeholder="For example: Review onboarding progress for this week's operations"/>
    <small>Enter 10–500 characters once for this workspace session. Do not include secrets or customer contact details. Counts do not require a record-access purpose.</small></label>;
}
