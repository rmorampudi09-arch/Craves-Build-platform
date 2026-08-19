"use client";

import {
  Camera,
  Check,
  CheckCircle2,
  FileText,
  ImagePlus,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

export type ChefEvidenceMetadata = {
  id: string;
  documentType: string;
  originalFileName: string;
  fileSizeBytes: number;
  status: string;
};

type EvidenceType =
  | "APPLICANT_PHOTO"
  | "GOVERNMENT_ID_FRONT"
  | "GOVERNMENT_ID_BACK"
  | "TAX_ID_CARD";

type ProgressState = {
  phase: "IDLE" | "UPLOADING" | "DONE" | "ERROR";
  message: string;
};

const REQUIREMENTS: Array<{
  type: EvidenceType;
  title: string;
  helper: string;
  reassurance: string;
  accept: string;
}> = [
  {
    type: "APPLICANT_PHOTO",
    title: "Your photo",
    helper: "Take a clear photo of your face, like a passport photo.",
    reassurance: "This helps customers know who is cooking their food.",
    accept: "image/jpeg,image/png",
  },
  {
    type: "GOVERNMENT_ID_FRONT",
    title: "Your ID — front side",
    helper: "Front of your Aadhaar card, Driving License, or Voter ID.",
    reassurance: "We keep your ID private.",
    accept: "application/pdf,image/jpeg,image/png",
  },
  {
    type: "GOVERNMENT_ID_BACK",
    title: "Your ID — back side",
    helper: "Back of the same ID you used on the previous step.",
    reassurance: "Both sides help us check the same ID.",
    accept: "application/pdf,image/jpeg,image/png",
  },
  {
    type: "TAX_ID_CARD",
    title: "Your PAN card",
    helper: "A clear photo of your PAN card so Craves can record payment details correctly.",
    reassurance: "Your PAN card is kept private.",
    accept: "application/pdf,image/jpeg,image/png",
  },
];

const INITIAL_PROGRESS: ProgressState = { phase: "IDLE", message: "" };
const MAX_FILE_BYTES = 10 * 1024 * 1024;

function parseUploadResponse(value: unknown): ChefEvidenceMetadata | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (
    typeof raw.id !== "string" ||
    typeof raw.documentType !== "string" ||
    typeof raw.originalFileName !== "string" ||
    typeof raw.fileSizeBytes !== "number" ||
    typeof raw.status !== "string"
  ) return null;
  return {
    id: raw.id,
    documentType: raw.documentType,
    originalFileName: raw.originalFileName,
    fileSizeBytes: raw.fileSizeBytes,
    status: raw.status,
  };
}

function firstTaskIndex(documents: ChefEvidenceMetadata[]): number {
  const byType = new Map(documents.map((document) => [document.documentType, document]));
  const correction = REQUIREMENTS.findIndex((item) => {
    const document = byType.get(item.type);
    return document && /reject|change|retry|replace/i.test(document.status);
  });
  if (correction >= 0) return correction;
  const missing = REQUIREMENTS.findIndex((item) => !byType.has(item.type));
  return missing >= 0 ? missing : REQUIREMENTS.length;
}

function allowedFile(type: EvidenceType, file: File): string | null {
  const imageTypes = new Set(["image/jpeg", "image/png"]);
  const allowed = type === "APPLICANT_PHOTO"
    ? imageTypes.has(file.type)
    : imageTypes.has(file.type) || file.type === "application/pdf";
  if (!allowed) {
    return type === "APPLICANT_PHOTO"
      ? "Please choose a JPG or PNG photo."
      : "Please choose a JPG, PNG, or PDF file.";
  }
  if (file.size > MAX_FILE_BYTES) return "This file is too large. Please choose one under 10 MB.";
  return null;
}

export function ChefApplicationEvidenceUploader({
  applicationReady,
  locked,
  initialDocuments,
  onComplete,
}: {
  applicationReady: boolean;
  locked: boolean;
  initialDocuments: ChefEvidenceMetadata[];
  onComplete?: () => void;
}) {
  const router = useRouter();
  const [documents, setDocuments] = useState<ChefEvidenceMetadata[]>(initialDocuments);
  const [activeIndex, setActiveIndex] = useState(() => firstTaskIndex(initialDocuments));
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [progress, setProgress] = useState<ProgressState>(INITIAL_PROGRESS);
  const requestRef = useRef<XMLHttpRequest | null>(null);

  const uploadedByType = useMemo(
    () => new Map(documents.map((document) => [document.documentType, document])),
    [documents],
  );

  useEffect(() => {
    if (!file || !file.type.startsWith("image/")) {
      setPreviewUrl("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function chooseFile(next: File | null) {
    requestRef.current?.abort();
    setFile(next);
    if (!next || activeIndex >= REQUIREMENTS.length) {
      setProgress(INITIAL_PROGRESS);
      return;
    }
    const error = allowedFile(REQUIREMENTS[activeIndex]!.type, next);
    setProgress(error ? { phase: "ERROR", message: error } : INITIAL_PROGRESS);
  }

  function upload() {
    const requirement = REQUIREMENTS[activeIndex];
    if (!requirement || !file || !applicationReady || locked) return;
    const validation = allowedFile(requirement.type, file);
    if (validation) {
      setProgress({ phase: "ERROR", message: validation });
      return;
    }

    const data = new FormData();
    data.set("documentType", requirement.type);
    data.set("file", file);

    const xhr = new XMLHttpRequest();
    requestRef.current = xhr;
    xhr.open("POST", "/api/chef/application/proof-files", true);
    xhr.responseType = "json";
    xhr.withCredentials = true;
    setProgress({ phase: "UPLOADING", message: "Saving this photo securely…" });

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const uploaded = parseUploadResponse(xhr.response);
        if (!uploaded) {
          setProgress({ phase: "ERROR", message: "The photo was received, but we couldn’t confirm it. Please try again." });
          return;
        }
        setDocuments((current) => [
          ...current.filter((document) => document.documentType !== requirement.type),
          uploaded,
        ]);
        setFile(null);
        setProgress({ phase: "DONE", message: "Looks good. This is saved." });
        router.refresh();
        return;
      }
      const message = xhr.status === 413
        ? "This file is too large. Please choose one under 10 MB."
        : xhr.status === 400
          ? "We couldn’t use this file. Please choose a clear JPG, PNG, or PDF."
          : "This photo couldn’t be uploaded. Please try again.";
      setProgress({ phase: "ERROR", message });
    };
    xhr.onerror = () => setProgress({ phase: "ERROR", message: "The connection dropped while saving this photo. Please try again." });
    xhr.onabort = () => setProgress(INITIAL_PROGRESS);
    xhr.send(data);
  }

  function continueForward() {
    if (activeIndex >= REQUIREMENTS.length) {
      if (onComplete) onComplete();
      else router.push("/chef");
      return;
    }
    const nextMissing = REQUIREMENTS.findIndex(
      (item, index) => index > activeIndex && !uploadedByType.has(item.type),
    );
    setFile(null);
    setProgress(INITIAL_PROGRESS);
    setActiveIndex(nextMissing >= 0 ? nextMissing : REQUIREMENTS.length);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goBack() {
    if (activeIndex <= 0) return;
    setFile(null);
    setProgress(INITIAL_PROGRESS);
    setActiveIndex((current) => Math.max(0, current - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (!applicationReady) {
    return (
      <section className="rounded-3xl border border-[#E5E7EB] bg-white p-7 text-center">
        <LoaderCircle className="mx-auto h-7 w-7 animate-spin text-[#F62E18]" aria-hidden="true" />
        <h2 className="mt-4 text-xl font-bold text-[#1A1A1A]">Saving your details first</h2>
        <p className="mt-2 text-sm text-[#6B6B6B]">Your photo step will open as soon as your details are ready.</p>
      </section>
    );
  }

  if (activeIndex >= REQUIREMENTS.length) {
    return (
      <section className="rounded-3xl border border-[#E5E7EB] bg-white p-7 text-center md:p-10">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#F1F3F5]">
          <CheckCircle2 className="h-7 w-7 text-[#F62E18]" aria-hidden="true" />
        </span>
        <p className="mt-6 text-sm font-semibold text-[#F62E18]">Part 2 of 3 · A few photos</p>
        <h1 className="mt-1 text-3xl font-bold text-[#1A1A1A]">All photos received</h1>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-[#6B6B6B]">Your photo, ID, and PAN card are saved. You don’t need to upload them again unless Craves asks for a clearer copy.</p>
        <div className="mt-6 grid grid-cols-4 gap-2" aria-hidden="true">
          {REQUIREMENTS.map((item) => <span key={item.type} className="h-1.5 rounded-full bg-[#F62E18]" />)}
        </div>
        <button type="button" onClick={continueForward} className="mt-7 min-h-12 w-full rounded-full bg-[#F62E18] px-6 font-semibold text-white">Continue</button>
      </section>
    );
  }

  const requirement = REQUIREMENTS[activeIndex]!;
  const uploaded = uploadedByType.get(requirement.type);
  const busy = progress.phase === "UPLOADING";
  const saved = Boolean(uploaded) && !file;

  return (
    <section className="rounded-3xl border border-[#E5E7EB] bg-white p-6 md:p-9">
      <div className="flex min-h-11 items-center justify-between gap-3">
        {activeIndex > 0 ? (
          <button type="button" onClick={goBack} className="min-h-11 rounded-full px-2 text-sm font-semibold text-[#1A1A1A] hover:bg-[#F1F3F5]">← Back</button>
        ) : <span />}
        <p className="text-sm font-semibold text-[#6B6B6B]">Part 2 of 3 · A few photos</p>
      </div>
      <div className="mt-2 grid grid-cols-4 gap-2" aria-hidden="true">
        {REQUIREMENTS.map((item, index) => (
          <span key={item.type} className={`h-1.5 rounded-full ${index <= activeIndex || uploadedByType.has(item.type) ? "bg-[#F62E18]" : "bg-[#E5E7EB]"}`} />
        ))}
      </div>

      <div className="mt-7 flex h-14 w-14 items-center justify-center rounded-full bg-[#F1F3F5]">
        {requirement.type === "APPLICANT_PHOTO" ? <Camera className="h-7 w-7 text-[#F62E18]" aria-hidden="true" /> : <ShieldCheck className="h-7 w-7 text-[#F62E18]" aria-hidden="true" />}
      </div>
      <p className="mt-5 text-sm font-semibold text-[#F62E18]">Photo {activeIndex + 1} of 4</p>
      <h1 className="mt-1 text-3xl font-bold text-[#1A1A1A]">{requirement.title}</h1>
      <p className="mt-2 text-sm leading-6 text-[#6B6B6B]">{requirement.helper}</p>

      <div className="mt-6 overflow-hidden rounded-2xl border border-dashed border-[#E5E7EB] bg-[#F1F3F5]">
        {previewUrl ? (
          <img src={previewUrl} alt="Selected preview" className="h-56 w-full object-contain bg-white" />
        ) : saved ? (
          <div className="flex min-h-52 flex-col items-center justify-center px-6 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white"><Check className="h-6 w-6 text-[#F62E18]" aria-hidden="true" /></span>
            <p className="mt-3 font-semibold text-[#1A1A1A]">Saved</p>
            <p className="mt-1 max-w-sm text-sm text-[#6B6B6B]">{requirement.reassurance}</p>
          </div>
        ) : file?.type === "application/pdf" ? (
          <div className="flex min-h-52 flex-col items-center justify-center px-6 text-center"><FileText className="h-8 w-8 text-[#F62E18]" aria-hidden="true" /><p className="mt-3 font-semibold text-[#1A1A1A]">{file.name}</p></div>
        ) : (
          <label className="flex min-h-52 cursor-pointer flex-col items-center justify-center px-6 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white"><ImagePlus className="h-6 w-6 text-[#F62E18]" aria-hidden="true" /></span>
            <p className="mt-3 font-semibold text-[#1A1A1A]">Take a photo or choose one</p>
            <p className="mt-1 text-sm text-[#6B6B6B]">Make sure the important details are easy to read.</p>
            <input
              type="file"
              accept={requirement.accept}
              capture={requirement.type === "APPLICANT_PHOTO" ? "user" : "environment"}
              disabled={locked || busy}
              onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
              className="sr-only"
            />
          </label>
        )}
      </div>

      {file ? (
        <label className="mt-3 inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-[#F62E18]">
          Choose a different photo
          <input type="file" accept={requirement.accept} disabled={locked || busy} onChange={(event) => chooseFile(event.target.files?.[0] ?? null)} className="sr-only" />
        </label>
      ) : saved && !locked ? (
        <label className="mt-3 inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-[#F62E18]">
          Replace this photo
          <input type="file" accept={requirement.accept} disabled={busy} onChange={(event) => chooseFile(event.target.files?.[0] ?? null)} className="sr-only" />
        </label>
      ) : null}

      {progress.message ? (
        <p role={progress.phase === "ERROR" ? "alert" : "status"} className={`mt-4 rounded-2xl bg-[#F1F3F5] p-4 text-sm ${progress.phase === "ERROR" ? "font-semibold text-[#F62E18]" : "text-[#6B6B6B]"}`}>
          {progress.message}
        </p>
      ) : null}

      {locked && !saved ? (
        <p className="mt-4 rounded-2xl bg-[#F1F3F5] p-4 text-sm text-[#6B6B6B]">Your application is already approved, so these photos can’t be changed here.</p>
      ) : null}

      {file ? (
        <button type="button" disabled={busy || progress.phase === "ERROR"} onClick={upload} className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#F62E18] px-6 font-semibold text-white disabled:opacity-50">
          {busy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
          {busy ? "Saving…" : "Use this photo"}
        </button>
      ) : saved ? (
        <button type="button" onClick={continueForward} className="mt-6 min-h-12 w-full rounded-full bg-[#F62E18] px-6 font-semibold text-white">Continue</button>
      ) : null}
    </section>
  );
}
