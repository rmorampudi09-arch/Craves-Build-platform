"use client";

import { chefApiError, ChefError, chefErrorText } from "@/lib/chef-errors";
import { useCallback, useEffect, useRef, useState } from "react";
import { chefReadinessSummary, parseChefApplicationReadiness, type ChefApplicationReadiness } from "@/lib/chef-readiness-contract";

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

  return <section className="rounded-3xl border border-slate-200 bg-white p-6" aria-busy={state === "loading"}>
    <h2 className="text-xl font-bold">Application readiness</h2>
    {state === "loading" ? <p role="status" className="mt-2 text-sm">Checking current approval requirements…</p>
      : state === "error" ? <p role="alert" className="mt-2 text-sm">{errorText || READINESS_UNAVAILABLE}</p>
      : data ? <>
        <p className="mt-2 text-sm">{chefReadinessSummary(data)}</p>
        <ul className="mt-4 space-y-2 text-sm">
          {data.documents.map(document => <li key={document.documentType} className="rounded-xl bg-slate-50 p-3">
            <span>{document.documentType.replaceAll("_", " ")}: {document.status.replaceAll("_", " ")}</span>
            {document.rejectionReason ? <p className="mt-1 text-red-700">{document.rejectionReason}</p> : null}
          </li>)}
        </ul>
        <p className="mt-3 text-xs text-slate-600">These checks cover your Chef application. They do not certify food-business compliance or enable payouts.</p>
      </> : null}
    <button type="button" disabled={state === "loading"} onClick={() => void load()} className="mt-4 min-h-11 rounded-full border border-slate-300 px-5 text-sm font-semibold disabled:opacity-50">Refresh readiness</button>
  </section>;
}
