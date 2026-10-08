"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, FileImage, FileText, Upload } from "lucide-react";
import type { ChefEvidenceMetadata } from "@/lib/chef-application-evidence-contract";

export async function prepareChefUpload(file: File, photo: boolean): Promise<File> {
  if (file.size === 0 || file.size > 10 * 1024 * 1024)
    throw new Error("Choose a file up to 10 MB.");
  if (file.type === "application/pdf" && !photo) return file;
  if (["image/jpeg", "image/png"].includes(file.type)) return file;
  if (
    !["image/webp", "image/heic", "image/heif"].includes(file.type) &&
    !/\.(webp|heic|heif)$/i.test(file.name)
  )
    throw new Error(
      photo ? "Choose a JPG, PNG or supported photo." : "Choose a JPG, PNG or PDF document.",
    );
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(
      "This browser could not read this photo. Export it as JPG or PNG, then try again.",
    );
  }
  try {
    const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Photo conversion is unavailable. Choose JPG or PNG instead.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.9),
    );
    if (!blob || blob.size > 10 * 1024 * 1024) throw new Error("Use a smaller JPG or PNG photo.");
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } finally {
    bitmap.close();
  }
}

type Props = {
  type: string;
  label: string;
  helper?: string;
  photo?: boolean;
  evidence?: ChefEvidenceMetadata;
  disabled: boolean;
  onUpload: (type: string, file: File, progress: (value: number) => void) => Promise<void>;
};
export function ChefOnboardingUpload({
  type,
  label,
  helper,
  photo = false,
  evidence,
  disabled,
  onUpload,
}: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const picker = useRef<HTMLInputElement>(null),
    camera = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!file || !file.type.startsWith("image/")) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const locked = evidence?.status === "APPROVED";
  async function choose(selected: File | undefined) {
    if (!selected) return;
    setError("");
    setBusy(true);
    try {
      const prepared = await prepareChefUpload(selected, photo);
      if (mounted.current) setFile(prepared);
    } catch (failure) {
      if (mounted.current)
        setError(failure instanceof Error ? failure.message : "Choose another file.");
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function submit() {
    if (!file || busy || disabled || locked) return;
    setBusy(true);
    setProgress(0);
    setError("");
    try {
      await onUpload(type, file, (value) => {
        if (mounted.current) setProgress(value);
      });
      if (mounted.current) setFile(null);
    } catch (failure) {
      if (mounted.current)
        setError(failure instanceof Error ? failure.message : "Upload failed. Please try again.");
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <section
      className="chef-onboarding-upload"
      id={`chef-${type}`}
      tabIndex={-1}
      aria-busy={busy}
      aria-labelledby={`chef-${type}-label`}
    >
      <h3 id={`chef-${type}-label`}>{label}</h3>
      {helper ? <p className="chef-onboarding-helper mt-1">{helper}</p> : null}
      {preview ? (
        <img src={preview} alt={`${label} preview`} />
      ) : evidence ? (
        <div className="mt-4 flex items-center gap-3 rounded-xl bg-[#F1F3F5] p-4">
          <FileImage size={22} aria-hidden="true" />
          <div>
            <span className="text-sm font-semibold">
              {evidence.status === "REJECTED" ? "Update this upload" : "Saved upload"}
            </span>
            <p className="chef-onboarding-file-name">{evidence.originalFileName}</p>
          </div>
        </div>
      ) : (
        <div className="mt-5 flex items-center gap-3 text-[#6B6B6B]">
          <Upload size={22} aria-hidden="true" />
          <span className="text-sm">{photo ? "Add a kitchen photo" : "Add your document"}</span>
        </div>
      )}
      {file && !preview ? (
        <p className="chef-onboarding-file-name flex items-center gap-2">
          <FileText size={16} aria-hidden="true" />
          {file.name}
        </p>
      ) : null}
      <input
        ref={picker}
        type="file"
        className="sr-only"
        tabIndex={-1}
        aria-label={label}
        accept={
          photo
            ? "image/jpeg,image/png,image/webp,image/heic,image/heif"
            : "application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"
        }
        disabled={disabled || busy || locked}
        onChange={(event) => {
          void choose(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      {photo ? (
        <input
          ref={camera}
          type="file"
          className="sr-only"
          tabIndex={-1}
          aria-label={`Take ${label.toLowerCase()}`}
          accept="image/*"
          capture="environment"
          disabled={disabled || busy || locked}
          onChange={(event) => {
            void choose(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      ) : null}
      {locked ? (
        <p className="chef-onboarding-verified mt-3">
          <CheckCircle2 size={15} aria-hidden="true" />
          Approved
        </p>
      ) : (
        <div className="chef-onboarding-upload-actions">
          <button
            type="button"
            className="chef-onboarding-text-action"
            disabled={disabled || busy}
            onClick={() => picker.current?.click()}
          >
            {file || evidence ? "Replace" : "Choose file"}
          </button>
          {photo && !file ? (
            <button
              type="button"
              className="chef-onboarding-text-action"
              disabled={disabled || busy}
              onClick={() => camera.current?.click()}
            >
              <Camera size={16} aria-hidden="true" />
              Take photo
            </button>
          ) : null}
          {file ? (
            <>
              <button
                type="button"
                className="chef-onboarding-text-action"
                disabled={disabled || busy}
                onClick={() => {
                  setFile(null);
                  setError("");
                }}
              >
                Remove
              </button>
              <button
                type="button"
                className="chef-onboarding-text-action"
                disabled={disabled || busy}
                onClick={() => void submit()}
              >
                {error ? "Retry upload" : photo ? "Upload photo" : "Upload document"}
              </button>
            </>
          ) : null}
        </div>
      )}
      {busy ? (
        <>
          <progress max={100} value={progress} aria-label={`${label} upload progress`} />
          <p role="status" className="chef-onboarding-helper mt-2">
            {progress === 100
              ? "Confirming saved upload"
              : progress
                ? `Uploading ${progress}%`
                : "Preparing your upload"}
          </p>
        </>
      ) : null}
      {error || evidence?.reviewReason ? (
        <p role="alert" className="mt-3 text-sm text-[#C4200F]">
          {error || evidence?.reviewReason}
        </p>
      ) : null}
    </section>
  );
}
