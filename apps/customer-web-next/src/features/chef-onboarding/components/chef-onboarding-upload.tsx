"use client";
import { sessionFetch } from "@/features/auth/api/sessionFetch";

import { chefErrorText } from "@/features/chef/lib/chef-errors";
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
import type { ChefEvidenceMetadata } from "@/features/chef-onboarding/lib/chef-application-evidence-contract";
import {
  FieldError,
  Spinner,
  StatusChip,
  fileKind,
  formatBytes,
} from "@/features/chef-onboarding/components/chef-onboarding-ui";
import { format, messages, textFor, type Language } from "@/shared/i18n/language";
import { useLanguage, useText } from "@/shared/i18n/language-context";

const MAX_BYTES = 10 * 1024 * 1024;
const IMAGE_NAME = /\.(jpe?g|png|webp|heic|heif)$/i;

const FILE_ERRORS = messages({
  en: {
    tooBig: "Choose a file up to 10 MB.",
    notPhoto: "Choose a JPG, PNG, HEIC or WebP photo.",
    notFile: "Choose a PDF, JPG, PNG, HEIC or WebP file.",
    unreadable: "This browser could not read this photo. Export it as JPG or PNG, then try again.",
    noConversion: "Photo conversion is unavailable. Choose JPG or PNG instead.",
    smaller: "Use a smaller JPG or PNG photo.",
  },
  te: {
    tooBig: "10 MB వరకు ఉన్న ఫైల్ ఎంచుకోండి.",
    notPhoto: "JPG, PNG, HEIC లేదా WebP ఫోటో ఎంచుకోండి.",
    notFile: "PDF, JPG, PNG, HEIC లేదా WebP ఫైల్ ఎంచుకోండి.",
    unreadable: "ఈ బ్రౌజర్ ఈ ఫోటోను చదవలేకపోయింది. దాన్ని JPG లేదా PNG గా మార్చి మళ్లీ ప్రయత్నించండి.",
    noConversion: "ఫోటో మార్చడం కుదరడం లేదు. JPG లేదా PNG ఎంచుకోండి.",
    smaller: "ఇంకా చిన్న JPG లేదా PNG ఫోటో వాడండి.",
  },
  kn: {
    tooBig: "10 MB ವರೆಗಿನ ಫೈಲ್ ಆಯ್ಕೆಮಾಡಿ.",
    notPhoto: "JPG, PNG, HEIC ಅಥವಾ WebP ಫೋಟೋ ಆಯ್ಕೆಮಾಡಿ.",
    notFile: "PDF, JPG, PNG, HEIC ಅಥವಾ WebP ಫೈಲ್ ಆಯ್ಕೆಮಾಡಿ.",
    unreadable: "ಈ ಬ್ರೌಸರ್ ಈ ಫೋಟೋವನ್ನು ಓದಲಾಗಲಿಲ್ಲ. ಅದನ್ನು JPG ಅಥವಾ PNG ಆಗಿ ಬದಲಿಸಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
    noConversion: "ಫೋಟೋ ಬದಲಿಸಲು ಆಗುತ್ತಿಲ್ಲ. JPG ಅಥವಾ PNG ಆಯ್ಕೆಮಾಡಿ.",
    smaller: "ಇನ್ನೂ ಚಿಕ್ಕ JPG ಅಥವಾ PNG ಫೋಟೋ ಬಳಸಿ.",
  },
});

const TEXT = messages({
  en: {
    uploadFailed: "Upload failed. Please try again.", chooseAnother: "Choose another file.", removeFailed: "Removal failed.",
    take: "Take {label}", confirming: " · Confirming", uploading: " · Uploading", preparing: " · Preparing", cancel: "Cancel",
    failed: "Upload failed", retry: "Retry", chooseAnotherFile: "Choose another file", open: "Open {label}",
    approved: "Approved", update: "Update", uploaded: "Uploaded", locked: "Reviewed by Craves. Contact support to change it.",
    replaceLabel: "Replace {label}", replace: "Replace", removeLabel: "Remove {label}", remove: "Remove",
    addPhoto: "Add photo", addFile: "Add file", photoHow: "Take a photo or choose one", fileHow: "Take a photo or choose a file",
    camera: "Use camera",
  },
  te: {
    uploadFailed: "అప్‌లోడ్ కాలేదు. మళ్లీ ప్రయత్నించండి.", chooseAnother: "వేరే ఫైల్ ఎంచుకోండి.", removeFailed: "తొలగించలేకపోయాం.",
    take: "{label} తీయండి", confirming: " · నిర్ధారిస్తున్నాం", uploading: " · అప్‌లోడ్ అవుతోంది", preparing: " · సిద్ధం చేస్తున్నాం", cancel: "రద్దు చేయండి",
    failed: "అప్‌లోడ్ కాలేదు", retry: "మళ్లీ ప్రయత్నించండి", chooseAnotherFile: "వేరే ఫైల్ ఎంచుకోండి", open: "{label} తెరవండి",
    approved: "ఆమోదించబడింది", update: "మార్చాలి", uploaded: "అప్‌లోడ్ అయింది", locked: "Craves దీన్ని చూసింది. మార్చాలంటే సహాయ బృందాన్ని అడగండి.",
    replaceLabel: "{label} మార్చండి", replace: "మార్చండి", removeLabel: "{label} తొలగించండి", remove: "తొలగించండి",
    addPhoto: "ఫోటో జోడించండి", addFile: "ఫైల్ జోడించండి", photoHow: "ఫోటో తీయండి, లేదా ఉన్నది ఎంచుకోండి", fileHow: "ఫోటో తీయండి, లేదా ఫైల్ ఎంచుకోండి",
    camera: "కెమెరా వాడండి",
  },
  kn: {
    uploadFailed: "ಅಪ್‌ಲೋಡ್ ಆಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.", chooseAnother: "ಬೇರೆ ಫೈಲ್ ಆಯ್ಕೆಮಾಡಿ.", removeFailed: "ತೆಗೆದುಹಾಕಲು ಆಗಲಿಲ್ಲ.",
    take: "{label} ತೆಗೆಯಿರಿ", confirming: " · ಖಚಿತಪಡಿಸುತ್ತಿದ್ದೇವೆ", uploading: " · ಅಪ್‌ಲೋಡ್ ಆಗುತ್ತಿದೆ", preparing: " · ಸಿದ್ಧಪಡಿಸುತ್ತಿದ್ದೇವೆ", cancel: "ರದ್ದುಮಾಡಿ",
    failed: "ಅಪ್‌ಲೋಡ್ ಆಗಲಿಲ್ಲ", retry: "ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ", chooseAnotherFile: "ಬೇರೆ ಫೈಲ್ ಆಯ್ಕೆಮಾಡಿ", open: "{label} ತೆರೆಯಿರಿ",
    approved: "ಅನುಮೋದಿಸಲಾಗಿದೆ", update: "ಬದಲಿಸಬೇಕು", uploaded: "ಅಪ್‌ಲೋಡ್ ಆಗಿದೆ", locked: "Craves ಇದನ್ನು ಪರಿಶೀಲಿಸಿದೆ. ಬದಲಾಯಿಸಲು ಸಹಾಯ ತಂಡವನ್ನು ಕೇಳಿ.",
    replaceLabel: "{label} ಬದಲಾಯಿಸಿ", replace: "ಬದಲಾಯಿಸಿ", removeLabel: "{label} ತೆಗೆದುಹಾಕಿ", remove: "ತೆಗೆದುಹಾಕಿ",
    addPhoto: "ಫೋಟೋ ಸೇರಿಸಿ", addFile: "ಫೈಲ್ ಸೇರಿಸಿ", photoHow: "ಫೋಟೋ ತೆಗೆಯಿರಿ, ಅಥವಾ ಇರುವುದನ್ನು ಆಯ್ಕೆಮಾಡಿ", fileHow: "ಫೋಟೋ ತೆಗೆಯಿರಿ, ಅಥವಾ ಫೈಲ್ ಆಯ್ಕೆಮಾಡಿ",
    camera: "ಕ್ಯಾಮೆರಾ ಬಳಸಿ",
  },
});

export async function prepareChefUpload(file: File, photo: boolean, language: Language = "en"): Promise<File> {
  const text = textFor(FILE_ERRORS, language);
  if (file.size === 0 || file.size > MAX_BYTES) throw new Error(text.tooBig);
  if (file.type === "application/pdf" && !photo) return file;
  if (["image/jpeg", "image/png"].includes(file.type)) return file;
  if (
    !["image/webp", "image/heic", "image/heif"].includes(file.type) &&
    !/\.(webp|heic|heif)$/i.test(file.name)
  )
    throw new Error(photo ? text.notPhoto : text.notFile);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(text.unreadable);
  }
  try {
    const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error(text.noConversion);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.9),
    );
    if (!blob || blob.size > MAX_BYTES) throw new Error(text.smaller);
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
    void sessionFetch(`/api/chef/onboarding/documents/${id}/preview`, {
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
  /**
   * Runs before a picker opens or a file is sent; returning false stops it. The section uses it
   * to point at required fields the upload depends on instead of failing on the server.
   */
  beforePick?: () => boolean;
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
  beforePick,
}: Props) {
  const text = useText(TEXT);
  const { language } = useLanguage();
  // English reads "Replace kitchen photo"; Telugu and Kannada keep the label as written (it may hold "PAN").
  const named = language === "en" ? label.toLowerCase() : label;
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
        setError(chefErrorText(failure, text.uploadFailed));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  /** Opens a picker only when the screen is ready for this file (see beforePick). */
  function pick(input: HTMLInputElement | null) {
    if (beforePick && !beforePick()) return;
    input?.click();
  }
  async function choose(selected: File | undefined) {
    if (!selected || disabled || busy || locked) return;
    if (beforePick && !beforePick()) return;
    setError("");
    let prepared: File;
    try {
      setBusy(true);
      prepared = await prepareChefUpload(selected, photo, language);
    } catch (failure) {
      if (mounted.current) {
        setBusy(false);
        setFile(null);
        setError(chefErrorText(failure, text.chooseAnother));
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
      if (mounted.current) setError(chefErrorText(failure, text.removeFailed));
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
          aria-label={format(text.take, { label: named })}
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
            <span>
              {meta}
              <span role="status">
                {progress >= 100 ? text.confirming : progress > 0 ? text.uploading : text.preparing}
              </span>
              {progress > 0 && progress < 100 ? <span aria-hidden="true"> {progress}%</span> : null}
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
              {text.cancel}
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
            style={{ background: "#F1F3F5", color: "#C4200F" }}
          >
            <AlertCircle size={24} />
          </span>
          <div className="cob-file-text">
            <strong>{text.failed}</strong>
            <span style={{ whiteSpace: "normal" }}>{error}</span>
          </div>
        </div>
        <div className="cob-upload-actions">
          <button
            type="button"
            className="cob-link"
            disabled={disabled || busy}
            onClick={() => file && (!beforePick || beforePick()) && void upload(file)}
          >
            <RefreshCw size={16} aria-hidden="true" />
            {text.retry}
          </button>
          <button
            type="button"
            className="cob-link"
            disabled={disabled || busy}
            onClick={() => pick(picker.current)}
          >
            {text.chooseAnotherFile}
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
              aria-label={format(text.open, { label: named })}
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
            <StatusChip tone="complete">{text.approved}</StatusChip>
          ) : rejected ? (
            <StatusChip tone="attention">{text.update}</StatusChip>
          ) : (
            <span className="cob-done-tick" role="img" aria-label={text.uploaded}>
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
            {text.locked}
          </span>
        ) : (
          <div className="cob-upload-actions">
            <button
              type="button"
              className="cob-link"
              disabled={disabled || busy}
              aria-label={format(text.replaceLabel, { label: named })}
              onClick={() => pick(picker.current)}
            >
              <RefreshCw size={16} aria-hidden="true" />
              {text.replace}
            </button>
            {onRemove && !rejected ? (
              <button
                type="button"
                className="cob-link"
                disabled={disabled || busy}
                aria-label={format(text.removeLabel, { label: named })}
                onClick={() => void removeSaved()}
              >
                <Trash2 size={16} aria-hidden="true" />
                {text.remove}
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
          onClick={() => pick(picker.current)}
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
          <strong>{emptyTitle ?? (photo ? text.addPhoto : text.addFile)}</strong>
          <span>{photo ? text.photoHow : text.fileHow}</span>
        </button>
        {photo ? (
          <div className="cob-upload-actions cob-camera-only">
            <button
              type="button"
              className="cob-link"
              disabled={disabled || busy}
              onClick={() => pick(camera.current)}
            >
              <Camera size={16} aria-hidden="true" />
              {text.camera}
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
