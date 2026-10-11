"use client";

import { chefApiError, ChefError, chefErrorText } from "@/features/chef/lib/chef-errors";
import { useCallback, useEffect, useRef, useState } from "react";
import { chefReadinessSummary, parseChefApplicationReadiness, type ChefApplicationReadiness } from "@/features/chef/lib/chef-readiness-contract";

const READINESS_UNAVAILABLE = "We couldn’t check application readiness. Please try again.";

export function ChefReadinessPanel() {
  const [data, setData] = useState<ChefApplicationReadiness | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [errorText, setErrorText] = useState("");
  const active = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setState("loading");
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch("/api/chef/application/readiness", { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw chefApiError(response, await response.json().catch(() => null), READINESS_UNAVAILABLE);
      const parsed = parseChefApplicationReadiness(await response.json());
      if (!parsed) throw new ChefError(READINESS_UNAVAILABLE, "INVALID_READINESS_RESPONSE", response.status);
      if (active.current !== controller) return;
      setData(parsed);
      setState("ready");
    } catch (cause) {
      if (active.current !== controller) return;
      setData(null);
      setErrorText(chefErrorText(cause, READINESS_UNAVAILABLE));
      setState("error");
    } finally {
      window.clearTimeout(timeout);
    }
  }, []);
  useEffect(() => {
    void load();
    const refresh = () => { void load(); };
    window.addEventListener("craves:chef-application-updated", refresh);
    return () => {
      window.removeEventListener("craves:chef-application-updated", refresh);
      const request = active.current;
      active.current = null;
      request?.abort();
    };
  }, [load]);

  return <section className="chef-section p-5 md:p-6" aria-busy={state === "loading"}>
    <h2 className="chef-section-title">Documents</h2>
    {state === "loading" ? <p role="status" className="mt-2 text-sm">Checking current approval requirements…</p>
      : state === "error" ? <p role="alert" className="mt-2 text-sm">{errorText || READINESS_UNAVAILABLE}</p>
      : data ? <>
        <p className="mt-2 text-sm">{chefReadinessSummary(data)}</p>
        <ul className="mt-4 space-y-2 text-sm">
          {data.documents.map(document => <li key={document.documentType} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#F1F3F5] px-4 py-3">
            <span className="font-semibold text-[#1A1A1A]">{sentence(document.documentType)}</span>
            <span className={`text-[0.8125rem] font-semibold ${document.status === "APPROVED" ? "text-[#0E6B4C]" : document.status === "REJECTED" ? "text-[#C4200F]" : "text-[#6B6B6B]"}`}>{sentence(document.status)}</span>
            {document.rejectionReason ? <p className="w-full text-[0.8125rem] text-[#C4200F]">{document.rejectionReason}</p> : null}
          </li>)}
        </ul>
        <p className="mt-3 text-[0.8125rem] leading-5 text-[#6B6B6B]">These checks are for your chef application only. They don’t certify food safety compliance or set up payouts.</p>
      </> : null}
    <button type="button" disabled={state === "loading"} onClick={() => void load()} className="chef-btn is-small mt-4">Refresh</button>
  </section>;
}

/** APPLICANT_PHOTO -> "Applicant photo", MISSING -> "Missing". */
function sentence(code: string): string {
  const words = code.toLowerCase().split("_").filter(Boolean).join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
