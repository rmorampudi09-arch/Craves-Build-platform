"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Camera,
  Check,
  FileText,
  ImageIcon,
  Lock,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type { ChefEvidenceMetadata } from "@/lib/chef-application-evidence-contract";
import {
  FieldError,
  Spinner,
  StatusChip,
  fileKind,
  formatBytes,
} from "@/components/chef-onboarding-ui";

const MAX_BYTES = 10 * 1024 * 1024;
const IMAGE_NAME = /\.(jpe?g|png|webp|heic|heif)$/i;

export async function prepareChefUpload(file: File, photo: boolean): Promise<File> {
  if (file.size === 0 || file.size > MAX_BYTES) throw new Error("Choose a file up to 10 MB.");
  if (file.type === "application/pdf" && !photo) return file;
  if (["image/jpeg", "image/png"].includes(file.type)) return file;
  if (
    !["image/webp", "image/heic", "image/heif"].includes(file.type) &&
    !/\.(webp|heic|heif)$/i.test(file.name)
  )
    throw new Error(
      photo
        ? "Choose a JPG, PNG, HEIC or WebP photo."
        : "Choose a PDF, JPG, PNG, HEIC or WebP file.",
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
    if (!blob || blob.size > MAX_BYTES) throw new Error("Use a smaller JPG or PNG photo.");
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } finally {
    bitmap.close();
  }
}

/** Fetches a short-lived private preview URL for a saved upload. Failures fall back to an icon. */
export function useSavedPreview(evidence: ChefEvidenceMetadata | undefined, enabled = true) {
  const [url, setUrl] = useState<string | null>(null);
  const id = evidence?.id;
  const image = Boolean(evidence && IMAGE_NAME.test(evidence.originalFileName));
  useEffect(() => {
    setUrl(null);
    if (!id || !enabled || !image) return;
    const controller = new AbortController();
    void fetch(`/api/chef/onboarding/documents/${id}/preview`, {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data: unknown = await response.json().catch(() => null);
        if (
          response.ok &&
          data &&
          typeof data === "object" &&
          "url" in data &&
          typeof data.url === "string" &&
          data.url.startsWith("https://") &&
          !controller.signal.aborted
        )
          setUrl(data.url);
      })
      .catch(() => {
        /* A missing preview keeps the saved file row with its icon. */
      });
    return () => controller.abort();
  }, [id, enabled, image, evidence?.status, evidence?.originalFileName]);
  return url;
}

type Props = {
  type: string;
  label: string;
  helper?: string;
  /** Short call to action shown in the empty drop zone. */
  emptyTitle?: string;
  photo?: boolean;
  evidence?: ChefEvidenceMetadata;
  disabled: boolean;
  /** A validation message from the section (for example a missing required upload). */
  fieldError?: string | null;
  onRemove?: (id: string) => Promise<void>;
  onCancel?: () => void;
  onUpload: (type: string, file: File, progress: (value: number) => void) => Promise<void>;
};

export function ChefOnboardingUpload({
  type,
  label,
  helper,
  emptyTitle,
  photo = false,
  evidence,
  disabled,
  fieldError,
  onUpload,
  onRemove,
  onCancel,
}: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const picker = useRef<HTMLInputElement>(null),
    camera = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  const cancelled = useRef(false);
  const [uploadedName, setUploadedName] = useState<string | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!file || !file.type.startsWith("image/")) {
      setLocalPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setLocalPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const locked = evidence?.status === "APPROVED";
  const rejected = evidence?.status === "REJECTED";
  // After a confirmed upload the local preview stays visible; otherwise fetch the saved preview.
  const showingUploadedLocal = Boolean(
    file && evidence && !busy && !error && uploadedName === evidence.originalFileName,
  );
  const savedPreview = useSavedPreview(evidence, !showingUploadedLocal);

  async function upload(prepared: File) {
    cancelled.current = false;
    setBusy(true);
    setProgress(0);
    setError("");
    try {
      await onUpload(type, prepared, (value) => {
        if (mounted.current) setProgress(value);
      });
      if (mounted.current) setUploadedName(prepared.name);
    } catch (failure) {
      if (!mounted.current) return;
      if (cancelled.current) {
        setFile(null);
        setError("");
      } else
        setError(failure instanceof Error ? failure.message : "Upload failed. Please try again.");
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function choose(selected: File | undefined) {
    if (!selected || disabled || busy || locked) return;
    setError("");
    let prepared: File;
    try {
      setBusy(true);
      prepared = await prepareChefUpload(selected, photo);
    } catch (failure) {
      if (mounted.current) {
        setBusy(false);
        setFile(null);
        setError(failure instanceof Error ? failure.message : "Choose another file.");
      }
      return;
    }
    if (!mounted.current) return;
    setFile(prepared);
    await upload(prepared);
  }
  async function removeSaved() {
    if (!evidence || !onRemove || locked || busy) return;
    setBusy(true);
    setError("");
    try {
      await onRemove(evidence.id);
      if (mounted.current) {
        setFile(null);
        setUploadedName(null);
      }
    } catch (failure) {
      if (mounted.current) setError(failure instanceof Error ? failure.message : "Removal failed.");
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  function cancel() {
    cancelled.current = true;
    onCancel?.();
  }

  const uploading = busy && file !== null && !error;
  const failed = Boolean(error && file);
  const accept = photo
    ? "image/jpeg,image/png,image/webp,image/heic,image/heif"
    : "application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif";
  const pickers = (
    <>
      <input
        ref={picker}
        type="file"
        className="sr-only"
        tabIndex={-1}
        aria-label={label}
        accept={accept}
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
    </>
  );

  const thumbSource =
    localPreview && (uploading || failed || showingUploadedLocal) ? localPreview : savedPreview;
  const thumb = (
    <span className="cob-thumb" aria-hidden="true">
      {thumbSource ? (
        // Local object URLs and private, short-lived preview URLs cannot use the image optimiser.
        <img src={thumbSource} alt="" />
      ) : photo || (evidence && IMAGE_NAME.test(evidence.originalFileName)) ? (
        <ImageIcon size={22} />
      ) : (
        <FileText size={22} />
      )}
    </span>
  );
  const name = file?.name ?? evidence?.originalFileName ?? "";
  const size = file?.size ?? evidence?.fileSizeBytes ?? 0;
  const meta = [fileKind(name, file?.type), formatBytes(size)].filter(Boolean).join(" · ");

  let body;
  if (uploading) {
    body = (
      <>
        <div className="cob-file">
          {thumb}
          <div className="cob-file-text">
            <strong>{name}</strong>
            <span role="status">
              {meta}
              {progress >= 100
                ? " · Confirming"
                : progress > 0
                  ? ` · ${progress}%`
                  : " · Preparing"}
            </span>
            <div className="cob-progress" aria-hidden="true">
              <span style={{ width: `${Math.max(4, progress)}%` }} />
            </div>
          </div>
          {progress === 0 || progress >= 100 ? <Spinner red /> : null}
        </div>
        {progress > 0 && progress < 100 && onCancel ? (
          <div className="cob-upload-actions">
            <button type="button" className="cob-link" onClick={cancel}>
              <X size={16} aria-hidden="true" />
              Cancel
            </button>
          </div>
        ) : null}
      </>
    );
  } else if (failed) {
    body = (
      <>
        <div className="cob-file cob-file--error" role="alert">
          <span
            className="cob-thumb"
            aria-hidden="true"
            style={{ background: "#FEEDEA", color: "#C4200F" }}
          >
            <AlertCircle size={24} />
          </span>
          <div className="cob-file-text">
            <strong>Upload failed</strong>
            <span style={{ whiteSpace: "normal" }}>{error}</span>
          </div>
        </div>
        <div className="cob-upload-actions">
          <button
            type="button"
            className="cob-link"
            disabled={disabled || busy}
            onClick={() => file && void upload(file)}
          >
            <RefreshCw size={16} aria-hidden="true" />
            Retry
          </button>
          <button
            type="button"
            className="cob-link"
            disabled={disabled || busy}
            onClick={() => picker.current?.click()}
          >
            Choose another file
          </button>
        </div>
      </>
    );
  } else if (evidence) {
    body = (
      <>
        <div className="cob-file">
          {savedPreview && !showingUploadedLocal ? (
            <a
              className="cob-thumb"
              href={savedPreview}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open ${label.toLowerCase()}`}
            >
              <img src={savedPreview} alt="" />
            </a>
          ) : (
            thumb
          )}
          <div className="cob-file-text">
            <strong>{evidence.originalFileName}</strong>
            <span>{meta}</span>
          </div>
          {locked ? (
            <StatusChip tone="complete">Approved</StatusChip>
          ) : rejected ? (
            <StatusChip tone="attention">Update</StatusChip>
          ) : (
            <span className="cob-done-tick" role="img" aria-label="Uploaded">
              <Check size={15} strokeWidth={3} aria-hidden="true" />
            </span>
          )}
        </div>
        {rejected && evidence.reviewReason ? (
          <FieldError>{evidence.reviewReason}</FieldError>
        ) : null}
        {locked ? (
          <span
            className="cob-helper"
            style={{ display: "inline-flex", gap: 6, alignItems: "center" }}
          >
            <Lock size={14} aria-hidden="true" />
            Reviewed by Craves. Contact support to change it.
          </span>
        ) : (
          <div className="cob-upload-actions">
            <button
              type="button"
              className="cob-link"
              disabled={disabled || busy}
              aria-label={`Replace ${label.toLowerCase()}`}
              onClick={() => picker.current?.click()}
            >
              <RefreshCw size={16} aria-hidden="true" />
              Replace
            </button>
            {onRemove && !rejected ? (
              <button
                type="button"
                className="cob-link"
                disabled={disabled || busy}
                aria-label={`Remove ${label.toLowerCase()}`}
                onClick={() => void removeSaved()}
              >
                <Trash2 size={16} aria-hidden="true" />
                Remove
              </button>
            ) : null}
            {busy ? <Spinner red /> : null}
          </div>
        )}
        {error ? <FieldError>{error}</FieldError> : null}
      </>
    );
  } else {
    body = (
      <>
        <button
          type="button"
          className="cob-dropzone"
          data-drag={dragging}
          disabled={disabled || busy}
          aria-describedby={helper ? `chef-${type}-helper` : undefined}
          onClick={() => picker.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            void choose(event.dataTransfer.files?.[0]);
          }}
        >
          <span className="cob-dropzone-icon" aria-hidden="true">
            {busy ? <Spinner red /> : <Upload size={20} />}
          </span>
          <strong>{emptyTitle ?? (photo ? "Add photo" : "Add file")}</strong>
          <span>{photo ? "Take a photo or choose one" : "Take a photo or choose a file"}</span>
        </button>
        {photo ? (
          <div className="cob-upload-actions cob-camera-only">
            <button
              type="button"
              className="cob-link"
              disabled={disabled || busy}
              onClick={() => camera.current?.click()}
            >
              <Camera size={16} aria-hidden="true" />
              Use camera
            </button>
          </div>
        ) : null}
        {error ? (
          <FieldError>{error}</FieldError>
        ) : fieldError ? (
          <FieldError>{fieldError}</FieldError>
        ) : null}
      </>
    );
  }

  return (
    <section
      className="cob-upload"
      id={`chef-${type}`}
      tabIndex={-1}
      aria-busy={busy}
      aria-labelledby={`chef-${type}-label`}
    >
      <div className="cob-upload-head">
        <strong id={`chef-${type}-label`}>{label}</strong>
        {helper ? <span id={`chef-${type}-helper`}>{helper}</span> : null}
      </div>
      {body}
      {pickers}
    </section>
  );
}
