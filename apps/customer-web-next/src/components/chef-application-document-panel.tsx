"use client";

import { useCallback, useEffect, useState } from "react";
import { ChefApplicationEvidenceUploader } from "@/components/chef-application-evidence-uploader";
import {
  parseChefEvidenceList,
  type ChefEvidenceMetadata,
} from "@/lib/chef-application-evidence-contract";

export function ChefApplicationDocumentPanel() {
  const [ready, setReady] = useState(false);
  const [locked, setLocked] = useState(false);
  const [documents, setDocuments] = useState<ChefEvidenceMetadata[]>([]);
  const [version, setVersion] = useState(0);

  const load = useCallback(async () => {
    const applicationResponse = await fetch("/api/chef/application", { cache: "no-store" });
    const application = await applicationResponse.json().catch(() => null) as { id?: unknown; status?: unknown } | null;
    if (!applicationResponse.ok) return;

    const applicationReady = typeof application?.id === "string" && application.id.length > 0;
    setReady(applicationReady);
    setLocked(application?.status === "APPROVED");
    if (!applicationReady) {
      setDocuments([]);
      return;
    }

    const documentResponse = await fetch("/api/chef/application/evidence-status", { cache: "no-store" });
    const parsed = parseChefEvidenceList(await documentResponse.json().catch(() => null));
    if (!documentResponse.ok || !parsed) return;
    setDocuments(parsed);
    setVersion(current => current + 1);
  }, []);

  useEffect(() => {
    void load();
    if (ready) return;
    const timer = window.setInterval(() => void load(), 2_500);
    return () => window.clearInterval(timer);
  }, [load, ready]);

  return (
    <ChefApplicationEvidenceUploader
      key={`${ready}-${locked}-${version}`}
      applicationReady={ready}
      locked={locked}
      initialDocuments={documents}
    />
  );
}
