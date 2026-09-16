"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChefApplicationEvidenceUploader } from "@/components/chef-application-evidence-uploader";
import {
  parseChefEvidenceList,
  type ChefEvidenceMetadata,
} from "@/lib/chef-application-evidence-contract";
import { parseChefApplication } from "@/lib/chef-application-contract";

type Loaded = { applicationReady: boolean; locked: boolean; documents: ChefEvidenceMetadata[] };
class DocumentLoadError extends Error {}

export function ChefApplicationDocumentPanel() {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const request = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/chef/application", { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new DocumentLoadError(response.status === 401 ? "Please sign in again to view your documents." : "We couldn’t load your application. Please try again.");
      const application = parseChefApplication(await response.json());
      if (!application || (application.status !== "NOT_SUBMITTED" && !application.id)) throw new DocumentLoadError("We couldn’t confirm your application details. Please try again.");
      const applicationReady = Boolean(application.id);
      let documents: ChefEvidenceMetadata[] = [];
      if (applicationReady) {
        const documentResponse = await fetch("/api/chef/application/evidence-status", { cache: "no-store", signal: controller.signal });
        if (!documentResponse.ok) throw new DocumentLoadError(documentResponse.status === 401 ? "Please sign in again to view your documents." : "We couldn’t load your document history. Please try again.");
        const parsed = parseChefEvidenceList(await documentResponse.json());
        if (!parsed) throw new DocumentLoadError("We couldn’t confirm your document history. Please try again.");
        documents = parsed;
      }
      if (request.current !== controller) return;
      if (controller.signal.aborted) throw new DocumentLoadError("Your document check took too long. Please try again.");
      setData({ applicationReady, locked: application.status === "APPROVED", documents });
      setVersion(current => current + 1);
    } catch (cause) {
      if (request.current !== controller) return;
      setData(null); // Unavailable evidence is not zero uploaded documents.
      setError(controller.signal.aborted ? "Your document check took too long. Please try again." : cause instanceof DocumentLoadError ? cause.message : "We couldn’t load your documents. Please try again.");
    } finally {
      window.clearTimeout(timeout);
      if (request.current === controller) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const refresh = () => { void load(); };
    window.addEventListener("craves:chef-application-updated", refresh);
    return () => {
      window.removeEventListener("craves:chef-application-updated", refresh);
      const active = request.current;
      request.current = null;
      active?.abort();
    };
  }, [load]);

  if (loading) return <section className="rounded-3xl border border-slate-200 bg-white p-6" aria-busy="true" aria-live="polite"><h2 className="text-xl font-bold">Your documents</h2><p className="mt-2 text-sm text-slate-600">Checking your document history…</p></section>;
  if (error) return <section className="rounded-3xl border border-slate-200 bg-white p-6"><h2 className="text-xl font-bold">Your documents</h2><p role="alert" className="mt-2 text-sm text-slate-700">{error}</p><button type="button" onClick={() => void load()} className="mt-4 min-h-12 rounded-full border border-slate-300 px-5 font-semibold">Try again</button></section>;
  if (!data) return null;

  return (
    <>
      <ChefApplicationEvidenceUploader key={version} applicationReady={data.applicationReady} locked={data.locked} initialDocuments={data.documents} />
      <button type="button" onClick={() => void load()} className="min-h-12 rounded-full border border-slate-300 px-5 font-semibold">{data.applicationReady ? "Refresh document history" : "I’ve submitted my details — refresh documents"}</button>
    </>
  );
}
