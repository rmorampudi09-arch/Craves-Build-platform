"use client";

import Link from "next/link";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Building2,
  Camera,
  Check,
  CheckCircle2,
  ExternalLink,
  FileCheck2,
  Headset,
  IdCard,
  Landmark,
  LocateFixed,
  MapPin,
  Move,
  PencilLine,
  Phone,
  Play,
  PlayCircle,
  Search,
  ShieldCheck,
  Store,
  UserRound,
} from "lucide-react";
import { EmailVerificationPanel } from "@/components/auth/EmailVerificationPanel";
import { AddressMapPicker } from "@/components/location/AddressMapPicker";
import { searchLocations, type LocationSearchResult } from "@/services/location/searchLocation";
import { reverseGeocodeCurrentLocation } from "@/services/location/reverseGeocode";
import {
  ONBOARDING_LANGUAGES,
  PROOF_OPTIONS,
  proofNeedsBack,
  type LearningContent,
  type OnboardingDetails,
  type ProofKind,
} from "@/lib/chef-onboarding-v2-contract";
import {
  CHEF_SECTION_LABELS,
  chefFullName,
  completedSections,
  evidenceComplete,
  kitchenAddress,
  type ChefFormSection,
} from "@/lib/chef-onboarding-flow";
import { ChefOnboardingUpload, useSavedPreview } from "@/components/chef-onboarding-upload";
import {
  Card,
  FieldError,
  FieldShell,
  LockedInput,
  Note,
  Spinner,
  StatusChip,
  VerifiedBadge,
  describedBy,
  formatDateOfBirth,
  formatFssai,
  formatPhone,
} from "@/components/chef-onboarding-ui";
import { chefOnboardingApi, type ChefOnboardingFlow } from "@/components/use-chef-onboarding";

type Props = { flow: ChefOnboardingFlow };

function fieldError(flow: ChefOnboardingFlow, name: string) {
  return flow.fieldError?.field === name ? flow.fieldError.message : null;
}

type TextFieldProps = Props & {
  name: keyof OnboardingDetails;
  label: string;
  maxLength?: number;
  type?: string;
  helper?: ReactNode;
  optional?: boolean;
  placeholder?: string;
  inputMode?: "numeric" | "text";
  autoComplete?: string;
  sanitize?: (value: string) => string;
};
function TextField({
  flow,
  name,
  label,
  maxLength = 255,
  type = "text",
  helper,
  optional,
  placeholder,
  inputMode,
  autoComplete,
  sanitize,
}: TextFieldProps) {
  const id = `chef-${name}`;
  const error = fieldError(flow, name);
  return (
    <FieldShell id={id} label={label} optional={optional} helper={helper} error={error}>
      <input
        id={id}
        type={type}
        className="cob-input"
        inputMode={inputMode}
        autoComplete={autoComplete ?? "off"}
        placeholder={placeholder}
        value={String(flow.details[name] ?? "")}
        max={type === "date" ? new Date().toISOString().slice(0, 10) : undefined}
        min={type === "date" ? "1900-01-01" : undefined}
        maxLength={maxLength}
        disabled={flow.busy}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={describedBy(id, error, helper)}
        onChange={(event) =>
          flow.field(name, (sanitize ? sanitize(event.target.value) : event.target.value) as never)
        }
      />
    </FieldShell>
  );
}

function Upload({
  flow,
  type,
  label,
  photo,
  helper,
  emptyTitle,
}: Props & { type: string; label: string; photo?: boolean; helper?: string; emptyTitle?: string }) {
  return (
    <ChefOnboardingUpload
      type={type}
      label={label}
      photo={photo}
      helper={helper}
      emptyTitle={emptyTitle}
      disabled={flow.busy}
      fieldError={fieldError(flow, type)}
      evidence={flow.state?.documents.find((document) => document.documentType === type)}
      onUpload={flow.uploadFile}
      onRemove={flow.removeFile}
      onCancel={flow.cancelUpload}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Screen 2 - Basic details                                            */
/* ------------------------------------------------------------------ */

export function ChefBasicDetails({ flow }: Props) {
  const [name, setName] = useState(() => chefFullName(flow.details));
  const nameError = fieldError(flow, "fullName");
  const phoneError = fieldError(flow, "phoneNumber");
  const emailError = fieldError(flow, "email");
  const nameHelper = "Enter your name as it appears on your bank account.";
  return (
    <div className="cob-stack">
      <Card icon={<UserRound size={20} aria-hidden="true" />} title="About you">
        <div className="cob-fields">
          <FieldShell id="chef-fullName" label="Full name" helper={nameHelper} error={nameError}>
            <input
              id="chef-fullName"
              autoComplete="name"
              className="cob-input"
              value={name}
              maxLength={120}
              placeholder="First and last name"
              disabled={flow.busy}
              aria-invalid={Boolean(nameError) || undefined}
              aria-describedby={describedBy("chef-fullName", nameError, nameHelper)}
              onChange={(event) => {
                const value = event.target.value;
                setName(value);
                const split = value.trim().lastIndexOf(" ");
                flow.updateDetails((previous) => ({
                  ...previous,
                  firstName: split > -1 ? value.trim().slice(0, split) : value.trim(),
                  lastName: split > -1 ? value.trim().slice(split + 1) : "",
                }));
              }}
            />
          </FieldShell>
          <TextField
            flow={flow}
            name="dateOfBirth"
            label="Date of birth"
            type="date"
            autoComplete="bday"
          />
        </div>
      </Card>
      <Card
        icon={<ShieldCheck size={20} aria-hidden="true" />}
        title="Contact details"
        subtitle="We’ll use these for updates about your application."
      >
        <div className="cob-fields">
          {flow.state?.phoneNumber ? (
            <LockedInput
              id="chef-phoneNumber"
              label="Mobile number"
              value={formatPhone(flow.state.phoneNumber)}
              badge={<VerifiedBadge />}
            />
          ) : (
            <div className="cob-field" id="chef-phoneNumber" tabIndex={-1}>
              <span className="cob-label">Mobile number</span>
              <FieldError>{phoneError ?? "Sign in again to verify your mobile number."}</FieldError>
              <Link href="/sign-in?returnTo=/chef/application" className="cob-link">
                Verify mobile number
              </Link>
            </div>
          )}
          <div id="chef-email" tabIndex={-1} className="cob-field">
            <EmailVerificationPanel
              required
              variant="onboarding"
              initialEmail={flow.details.email}
              onStateChange={flow.onEmail}
            />
            {emailError ? <FieldError>{emailError}</FieldError> : null}
          </div>
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Screen 3 - Kitchen details                                          */
/* ------------------------------------------------------------------ */

export function ChefKitchenDetails({ flow }: Props) {
  const [query, setQuery] = useState(""),
    [results, setResults] = useState<LocationSearchResult[]>([]);
  const [locating, setLocating] = useState(false),
    [searching, setSearching] = useState(false),
    [locationError, setLocationError] = useState("");
  const [pinnedLabel, setPinnedLabel] = useState("");
  const generation = useRef(0),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const d = flow.details;
  const hasPin = d.latitude != null && d.longitude != null;
  async function pin(latitude: number, longitude: number, label = "") {
    const request = ++generation.current;
    flow.updateDetails((previous) => ({ ...previous, latitude, longitude }));
    setLocationError("");
    setPinnedLabel(label);
    setLocating(true);
    try {
      const address = await reverseGeocodeCurrentLocation(latitude, longitude);
      if (!mounted.current || request !== generation.current) return;
      setPinnedLabel(address.formattedAddress);
      flow.updateDetails((previous) => ({
        ...previous,
        addressLine1: address.houseNumber ?? previous.addressLine1,
        addressLine2:
          [address.street, address.area].filter(Boolean).join(", ") || previous.addressLine2,
        city: address.city ?? previous.city,
        state: address.state ?? previous.state,
        postalCode: address.postalCode ?? previous.postalCode,
      }));
    } catch {
      if (mounted.current && request === generation.current)
        setLocationError(
          "Your pin is selected. We couldn’t fill in the address automatically, so please enter or correct it below.",
        );
    } finally {
      if (mounted.current && request === generation.current) setLocating(false);
    }
  }
  async function locate() {
    if (!navigator.geolocation) {
      setLocationError(
        "Location isn’t available in this browser. Search for your address instead.",
      );
      return;
    }
    setLocating(true);
    setLocationError("");
    const request = ++generation.current;
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          timeout: 15000,
          enableHighAccuracy: true,
        }),
      );
      if (mounted.current && request === generation.current)
        await pin(position.coords.latitude, position.coords.longitude);
    } catch (failure) {
      if (mounted.current && request === generation.current) {
        const denied =
          typeof failure === "object" &&
          failure !== null &&
          "code" in failure &&
          failure.code === 1;
        setLocationError(
          denied
            ? "Location access is turned off. Allow it in your browser settings, or search for your address."
            : "We couldn’t find your location. Search for your address or try again.",
        );
        setLocating(false);
      }
    }
  }
  async function search() {
    if (query.trim().length < 3) {
      setLocationError("Enter at least 3 characters to search.");
      return;
    }
    const request = ++generation.current;
    setSearching(true);
    setLocationError("");
    setResults([]);
    try {
      const found = await searchLocations(
        query.trim(),
        hasPin ? { latitude: d.latitude!, longitude: d.longitude! } : undefined,
      );
      if (!mounted.current || request !== generation.current) return;
      setResults(found);
      if (!found.length)
        setLocationError("No matching address found. Try a nearby landmark or area name.");
    } catch (failure) {
      if (mounted.current && request === generation.current)
        setLocationError(
          failure instanceof Error
            ? failure.message
            : "Address search is unavailable right now. Use your current location or enter the address below.",
        );
    } finally {
      if (mounted.current && request === generation.current) setSearching(false);
    }
  }
  const state = flow.state;
  const photosDone = Boolean(
    state &&
    evidenceComplete(state, "KITCHEN_PHOTO_1") &&
    evidenceComplete(state, "KITCHEN_PHOTO_2"),
  );
  const addressDone = Boolean(
    hasPin && d.addressLine1 && d.city && d.state && /^\d{6}$/.test(d.postalCode),
  );
  const description = d.kitchenDescription ?? "";
  const locationFieldError = fieldError(flow, "location");
  return (
    <div className="cob-stack">
      <Card
        icon={<Store size={20} aria-hidden="true" />}
        title="Kitchen information"
        done={Boolean(d.kitchenName.trim())}
      >
        <div className="cob-fields">
          <TextField
            flow={flow}
            name="kitchenName"
            label="Kitchen name"
            maxLength={160}
            placeholder="For example, Ananya’s Kitchen"
          />
          <FieldShell
            id="chef-kitchenDescription"
            label="About your kitchen"
            optional
            after={<span className="cob-counter">{description.length}/1000</span>}
          >
            <textarea
              id="chef-kitchenDescription"
              className="cob-input"
              rows={3}
              maxLength={1000}
              placeholder="A line about the food you love to cook"
              disabled={flow.busy}
              value={description}
              onChange={(event) => flow.field("kitchenDescription", event.target.value)}
            />
          </FieldShell>
        </div>
      </Card>

      <Card
        id="chef-location"
        icon={<MapPin size={20} aria-hidden="true" />}
        title="Kitchen address"
        subtitle="Find your kitchen, then check the pin."
        done={addressDone}
      >
        <div className="cob-fields">
          <div className="cob-map">
            {hasPin ? (
              <>
                <span className="cob-map-hint">
                  <Move size={14} aria-hidden="true" />
                  Drag the map to adjust the pin
                </span>
                <AddressMapPicker
                  latitude={d.latitude!}
                  longitude={d.longitude!}
                  disabled={flow.busy || searching}
                  locating={locating}
                  showLocateButton={false}
                  ariaLabel="Kitchen map. Drag the map or use the arrow keys to move the pin to your kitchen."
                  onCenterChange={(point) => void pin(point.latitude, point.longitude)}
                  onUseCurrentLocation={() => void locate()}
                />
              </>
            ) : (
              <div className="cob-map-empty">
                <div>
                  <span className="cob-icon-well">
                    <MapPin size={22} aria-hidden="true" />
                  </span>
                  <strong>Your kitchen pin will appear here</strong>
                  <span>Search for your address or use your current location.</span>
                </div>
              </div>
            )}
          </div>

          <div className="cob-field">
            <label className="cob-label" htmlFor="chef-location-search">
              Search location
            </label>
            <div className="cob-control">
              <Search size={18} className="cob-input-icon" aria-hidden="true" />
              <input
                id="chef-location-search"
                type="search"
                enterKeyHint="search"
                className="cob-input cob-input--with-icon cob-input--with-trailing-icon"
                autoComplete="off"
                placeholder="Building, street or area"
                value={query}
                maxLength={200}
                disabled={flow.busy}
                aria-controls={results.length ? "chef-location-results" : undefined}
                onChange={(event) => {
                  generation.current++;
                  setQuery(event.target.value);
                  setResults([]);
                  setSearching(false);
                  setLocating(false);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void search();
                  }
                }}
              />
              <button
                type="button"
                aria-label="Search address"
                className="cob-trailing-button"
                disabled={flow.busy || searching}
                onClick={() => void search()}
              >
                {searching ? <Spinner red /> : <Search size={18} aria-hidden="true" />}
              </button>
            </div>
            {searching ? (
              <span role="status" className="cob-helper">
                Searching addresses…
              </span>
            ) : null}
            {results.length ? (
              <div id="chef-location-results" className="cob-results" role="list">
                {results.map((result) => (
                  <button
                    key={result.id}
                    type="button"
                    role="listitem"
                    className="cob-result"
                    onClick={() => {
                      setResults([]);
                      setQuery(result.formattedAddress);
                      void pin(result.latitude, result.longitude, result.formattedAddress);
                    }}
                  >
                    <MapPin size={16} aria-hidden="true" />
                    <span>{result.formattedAddress}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <button
            type="button"
            className="cob-outline-red"
            disabled={flow.busy || locating}
            onClick={() => void locate()}
          >
            {locating ? <Spinner red /> : <LocateFixed size={18} aria-hidden="true" />}
            {locating ? "Finding your location…" : "Use my current location"}
          </button>

          {locationError || locationFieldError ? (
            <FieldError>{locationError || locationFieldError}</FieldError>
          ) : null}

          {hasPin ? (
            <div className="cob-pinned" role="status">
              <MapPin size={18} aria-hidden="true" />
              <span>
                {pinnedLabel || kitchenAddress(d) || "Pin placed on the map"}
                <small>Move the map if the pin isn’t exactly on your kitchen.</small>
              </span>
            </div>
          ) : null}

          <div className="cob-divider" style={{ margin: "2px 0" }} />

          <div
            className="cob-fields"
            onChange={() => {
              generation.current++;
              setLocating(false);
              setSearching(false);
            }}
          >
            <TextField
              flow={flow}
              name="addressLine1"
              label="Flat / house number / building"
              autoComplete="address-line1"
            />
            <TextField
              flow={flow}
              name="addressLine2"
              label="Street / area"
              autoComplete="address-line2"
            />
            <TextField
              flow={flow}
              name="landmark"
              label="Landmark"
              optional
              placeholder="For example, near the metro station"
            />
            <div className="cob-pair">
              <TextField
                flow={flow}
                name="postalCode"
                label="PIN code"
                maxLength={6}
                inputMode="numeric"
                autoComplete="postal-code"
                sanitize={(value) => value.replace(/\D/g, "").slice(0, 6)}
              />
              <TextField
                flow={flow}
                name="city"
                label="City"
                maxLength={80}
                autoComplete="address-level2"
              />
            </div>
            <TextField
              flow={flow}
              name="state"
              label="State"
              maxLength={80}
              autoComplete="address-level1"
            />
          </div>
        </div>
      </Card>

      <Card
        icon={<Camera size={20} aria-hidden="true" />}
        title="Kitchen photos"
        subtitle="Two clear photos of where you cook."
        done={photosDone}
      >
        <div className="cob-photo-grid">
          <Upload
            flow={flow}
            type="KITCHEN_PHOTO_1"
            label="Overall kitchen photo"
            photo
            helper="Show the full kitchen space where you prepare food."
          />
          <Upload
            flow={flow}
            type="KITCHEN_PHOTO_2"
            label="Cooking setup photo"
            photo
            helper="Show your stove and the cooking equipment you use."
          />
          <p className="cob-formats">JPG, PNG, HEIC or WebP · up to 10 MB each</p>
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Screen 4 - FSSAI                                                    */
/* ------------------------------------------------------------------ */

const FOSCOS_URL = "https://foscos.fssai.gov.in/";

export function ChefFssaiDetails({ flow }: Props) {
  if (flow.fssaiGuide) return <FssaiGuide flow={flow} />;
  const id = "chef-fssaiNumber";
  const value = flow.details.fssaiNumber;
  const error = fieldError(flow, "fssaiNumber");
  const reviewed = Boolean(
    flow.state?.progress?.fssaiVerified && flow.state.details?.fssaiNumber === value,
  );
  const complete = /^\d{14}$/.test(value);
  const helper = "The 14-digit number on your FSSAI registration or licence.";
  return (
    <div className="cob-stack">
      <Card>
        <FieldShell
          id={id}
          label="FSSAI registration number"
          helper={helper}
          error={error}
          after={
            <button
              type="button"
              className="cob-link"
              style={{ justifySelf: "start", marginTop: 4 }}
              disabled={flow.busy}
              onClick={() => flow.setFssaiGuide(true)}
            >
              Don’t have FSSAI?
            </button>
          }
        >
          <div className="cob-control">
            <input
              id={id}
              className="cob-input cob-input--with-adornment cob-mono"
              inputMode="numeric"
              autoComplete="off"
              placeholder="14-digit number"
              maxLength={14}
              value={value}
              disabled={flow.busy}
              aria-invalid={Boolean(error) || undefined}
              aria-describedby={describedBy(id, error, helper)}
              onChange={(event) =>
                flow.field("fssaiNumber", event.target.value.replace(/\D/g, "").slice(0, 14))
              }
            />
            <span className="cob-adornment" aria-live="polite">
              {reviewed ? (
                <VerifiedBadge label="Verified by Craves" />
              ) : complete ? (
                <span className="cob-success-line">
                  <CheckCircle2 size={16} aria-hidden="true" />
                  14/14
                </span>
              ) : value ? (
                <span className="cob-helper cob-mono">{value.length}/14</span>
              ) : null}
            </span>
          </div>
        </FieldShell>
      </Card>
    </div>
  );
}

function isLearningContent(item: unknown): item is LearningContent {
  if (!item || typeof item !== "object") return false;
  const value = item as Record<string, unknown>;
  return (
    typeof value.id === "string" &&
    /^[0-9a-f-]{36}$/i.test(value.id) &&
    typeof value.title === "string" &&
    (value.kind === "ARTICLE" || value.kind === "VIDEO") &&
    typeof value.language === "string" &&
    (value.body == null || typeof value.body === "string")
  );
}

function FssaiGuide({ flow }: Props) {
  const [content, setContent] = useState<LearningContent[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  const [playback, setPlayback] = useState<Record<string, string>>({});
  const [opening, setOpening] = useState<string | null>(null);
  const [videoError, setVideoError] = useState("");
  const language = flow.details.language;
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setContent([]);
    setPlayback({});
    setVideoError("");
    void fetch("/api/chef/onboarding/content?language=" + encodeURIComponent(language), {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("The video guide is unavailable right now.");
        const raw: unknown = await response.json();
        if (!Array.isArray(raw) || raw.length > 100 || !raw.every(isLearningContent))
          throw new Error("The video guide could not be loaded.");
        if (!controller.signal.aborted)
          setContent(
            raw.filter(
              (item) =>
                item.published === true && item.ready === true && item.language === language,
            ),
          );
      })
      .catch((failure) => {
        if (!controller.signal.aborted)
          setError(
            failure instanceof Error
              ? failure.message
              : "The video guide is unavailable right now.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [language, attempt]);

  async function play(item: LearningContent) {
    setOpening(item.id);
    setVideoError("");
    try {
      const result = await chefOnboardingApi(`/api/chef/onboarding/content/${item.id}/playback`);
      if (
        !result ||
        typeof result !== "object" ||
        !("url" in result) ||
        typeof result.url !== "string" ||
        !result.url.startsWith("https://")
      )
        throw new Error("The video could not be opened. Please try again.");
      setPlayback((previous) => ({ ...previous, [item.id]: result.url as string }));
    } catch (failure) {
      setVideoError(failure instanceof Error ? failure.message : "The video could not be opened.");
    } finally {
      setOpening(null);
    }
  }

  const videos = content.filter((item) => item.kind === "VIDEO");
  const articles = content.filter((item) => item.kind === "ARTICLE");
  return (
    <div className="cob-stack">
      <Card>
        <ol className="cob-steps">
          <li>
            <strong>Visit the official FSSAI FoSCoS portal</strong>
            <p>
              Open the official registration and licensing website,{" "}
              <a href={FOSCOS_URL} target="_blank" rel="noopener noreferrer">
                foscos.fssai.gov.in
                <ExternalLink
                  size={13}
                  aria-hidden="true"
                  style={{ display: "inline", marginLeft: 3 }}
                />
              </a>
              .
            </p>
          </li>
          <li>
            <strong>Choose the registration or licence for your business</strong>
            <p>Use the portal’s eligibility guidance to pick the right option.</p>
          </li>
          <li>
            <strong>Enter your details</strong>
            <p>Complete the required personal and food business information.</p>
          </li>
          <li>
            <strong>Upload documents and submit</strong>
            <p>Provide the requested documents and pay the applicable fee shown on the portal.</p>
          </li>
          <li>
            <strong>Track your application</strong>
            <p>Use your acknowledgement or reference number to follow the status on FoSCoS.</p>
          </li>
        </ol>
      </Card>

      <Card>
        <div className="cob-card-head">
          <span className="cob-icon-well">
            <PlayCircle size={20} aria-hidden="true" />
          </span>
          <div className="cob-card-title">
            <h2>Watch how to apply</h2>
            <label className="cob-inline-select">
              <span>Language</span>
              <select
                aria-label="Preferred language"
                className="cob-select-sm"
                disabled={flow.busy}
                value={language}
                onChange={(event) => flow.field("language", event.target.value)}
              >
                {ONBOARDING_LANGUAGES.map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        {loading ? (
          <div
            className="cob-skeleton"
            style={{ aspectRatio: "16 / 9" }}
            role="status"
            aria-label="Loading video guide"
          />
        ) : error ? (
          <div className="cob-video-empty" role="alert">
            <span>{error} You can still follow the steps above or request a call.</span>
            <button
              type="button"
              className="cob-link"
              onClick={() => setAttempt((value) => value + 1)}
            >
              Try again
            </button>
          </div>
        ) : videos.length === 0 && articles.length === 0 ? (
          <div className="cob-video-empty">
            <PlayCircle size={28} aria-hidden="true" />
            <span>
              No learning content is published in this language yet. Follow the steps above or
              request a call.
            </span>
          </div>
        ) : (
          <div className="cob-fields">
            {videos.map((item) => (
              <div key={item.id} className="cob-field" lang={item.language}>
                <div className="cob-video">
                  {playback[item.id] ? (
                    <video
                      controls
                      autoPlay
                      playsInline
                      preload="metadata"
                      src={playback[item.id]}
                      aria-label={item.title}
                      onError={() =>
                        setVideoError(
                          "Video access expired or playback failed. Play it again to retry.",
                        )
                      }
                    />
                  ) : (
                    <button
                      type="button"
                      className="cob-video-poster"
                      disabled={opening !== null}
                      aria-label={`Watch video: ${item.title}`}
                      onClick={() => void play(item)}
                    >
                      <span className="cob-play" aria-hidden="true">
                        {opening === item.id ? <Spinner /> : <Play size={24} fill="currentColor" />}
                      </span>
                      <span>{item.title}</span>
                    </button>
                  )}
                </div>
                {playback[item.id] ? (
                  <button
                    type="button"
                    className="cob-link"
                    onClick={() => {
                      setPlayback((previous) => {
                        const next = { ...previous };
                        delete next[item.id];
                        return next;
                      });
                      void play(item);
                    }}
                  >
                    Reload video
                  </button>
                ) : null}
              </div>
            ))}
            {videoError ? <FieldError>{videoError}</FieldError> : null}
            {articles.map((item) => (
              <article key={item.id} lang={item.language}>
                <h3 style={{ fontSize: 15, fontWeight: 700 }}>{item.title}</h3>
                <p
                  className="cob-helper"
                  style={{ marginTop: 4, whiteSpace: "pre-wrap", fontSize: 14 }}
                >
                  {item.body}
                </p>
              </article>
            ))}
          </div>
        )}
      </Card>

      <Card
        icon={<Headset size={20} aria-hidden="true" />}
        title="Need help with FSSAI?"
        subtitle="Our team can guide you through the application process."
      >
        {flow.callbackCase ? (
          <div className="cob-success" role="status">
            <CheckCircle2
              size={22}
              aria-hidden="true"
              style={{ color: "#C4200F", flexShrink: 0 }}
            />
            <div>
              <strong>Request received</strong>
              <p>
                Our Craves team will call you on your registered mobile number to help with your
                FSSAI application.
              </p>
              <small>Reference {flow.callbackCase}</small>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="cob-secondary"
            disabled={flow.busy}
            onClick={() => void flow.requestCallback()}
          >
            <Phone size={18} aria-hidden="true" />
            Request a call from Craves
          </button>
        )}
      </Card>

      <Note tone="neutral">
        You can finish the other sections now. Add your FSSAI number before you submit your
        application.
      </Note>

      <button
        type="button"
        className="cob-link cob-link--center"
        disabled={flow.busy}
        onClick={() => flow.setFssaiGuide(false)}
      >
        I have an FSSAI number
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Screen 5 - Identity                                                 */
/* ------------------------------------------------------------------ */

const PROOF_SHORT: Record<ProofKind, string> = {
  AADHAAR: "Aadhaar card",
  PAN: "PAN card",
  BANK_STATEMENT: "Bank statement",
  OTHER_GOVERNMENT_ID: "Other government ID",
};

export function ChefIdentityDetails({ flow }: Props) {
  const proof = flow.details.proofKind;
  const locked = Boolean(
    flow.state?.documents.some((document) => document.documentType.startsWith("SELECTED_PROOF_")),
  );
  const twoSided = proofNeedsBack(proof);
  const proofError = fieldError(flow, "proofKind");
  const done = Boolean(
    proof &&
    flow.state &&
    evidenceComplete(flow.state, "SELECTED_PROOF_FRONT") &&
    (!twoSided || evidenceComplete(flow.state, "SELECTED_PROOF_BACK")),
  );
  return (
    <div className="cob-stack">
      <Card
        id="chef-proofKind"
        icon={<IdCard size={20} aria-hidden="true" />}
        title="Document type"
      >
        <div className="cob-fields">
          <div className="cob-choices" role="radiogroup" aria-label="Identity document">
            {PROOF_OPTIONS.map(([key]) => {
              const selected = proof === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className="cob-choice"
                  disabled={flow.busy || (locked && !selected)}
                  onClick={() => flow.field("proofKind", key as ProofKind)}
                >
                  {selected ? <Check size={16} strokeWidth={3} aria-hidden="true" /> : null}
                  {PROOF_SHORT[key]}
                </button>
              );
            })}
          </div>
          {proofError ? (
            <FieldError>{proofError}</FieldError>
          ) : (
            <span className="cob-helper">
              {locked
                ? "To choose a different document, remove the uploaded files first."
                : "Choose one valid document that shows your name."}
            </span>
          )}
          {proof === "OTHER_GOVERNMENT_ID" ? (
            <TextField
              flow={flow}
              name="otherGovernmentId"
              label="Name of the ID"
              maxLength={80}
              placeholder="For example, Voter ID, Driving Licence or Passport"
            />
          ) : null}
        </div>
      </Card>
      {proof ? (
        <Card
          icon={<FileCheck2 size={20} aria-hidden="true" />}
          title={PROOF_SHORT[proof]}
          subtitle={twoSided ? "Upload the front and the back." : "Upload one clear photo or PDF."}
          done={done}
        >
          <div className="cob-photo-grid">
            <Upload
              flow={flow}
              type="SELECTED_PROOF_FRONT"
              label={twoSided ? "Front side" : PROOF_SHORT[proof]}
              emptyTitle={twoSided ? "Add front side" : "Add document"}
            />
            {twoSided ? (
              <Upload
                flow={flow}
                type="SELECTED_PROOF_BACK"
                label="Back side"
                emptyTitle="Add back side"
              />
            ) : null}
            <p className="cob-formats">PDF, JPG, PNG, HEIC or WebP · up to 10 MB each</p>
          </div>
        </Card>
      ) : null}
      {proof ? (
        <Note>
          Make sure all four corners are visible, the text is readable and there is no glare.
        </Note>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Screen 7 - Review                                                   */
/* ------------------------------------------------------------------ */

function ReviewCard({
  flow,
  icon,
  section,
  complete,
  children,
  editable = true,
}: Props & {
  icon: ReactNode;
  section: ChefFormSection;
  complete: boolean;
  children: ReactNode;
  editable?: boolean;
}) {
  const title = CHEF_SECTION_LABELS[section];
  return (
    <section className="cob-card" aria-labelledby={`review-${section}`}>
      <div className="cob-review-head">
        <span className="cob-icon-well">{icon}</span>
        <div className="cob-card-title">
          <h2 id={`review-${section}`}>{title}</h2>
          {complete ? (
            <StatusChip tone="complete">Complete</StatusChip>
          ) : (
            <StatusChip tone="attention">Needs attention</StatusChip>
          )}
        </div>
        {editable ? (
          <button
            type="button"
            className="cob-link"
            aria-label={`Edit ${title}`}
            disabled={flow.busy}
            onClick={() => flow.edit(section)}
          >
            <PencilLine size={16} aria-hidden="true" />
            Edit
          </button>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function Rows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="cob-rows">
      {rows.map(([label, value]) => (
        <div key={label} className="cob-row">
          <dt>{label}</dt>
          <dd className={value ? undefined : "cob-muted"}>{value || "Not added"}</dd>
        </div>
      ))}
    </dl>
  );
}

function ReviewPhoto({ flow, type, label }: Props & { type: string; label: string }) {
  const evidence = flow.state?.documents.find(
    (document) => document.documentType === type && document.status !== "REJECTED",
  );
  const preview = useSavedPreview(evidence);
  return (
    <div className="cob-review-photo">
      <span className="cob-thumb">
        {preview ? (
          <img src={preview} alt={label} />
        ) : evidence ? (
          <Check size={20} aria-label={`${label} uploaded`} style={{ color: "#C4200F" }} />
        ) : (
          <Camera size={20} aria-label={`${label} missing`} />
        )}
      </span>
      <span>{label}</span>
    </div>
  );
}

export function ChefReviewDetails({ flow }: Props) {
  const d = flow.details,
    saved = flow.state;
  if (!saved) return null;
  const completion = completedSections(saved, flow.bank);
  const uploaded = (type: string) => evidenceComplete(saved, type);
  const fssaiAdded = /^\d{14}$/.test(d.fssaiNumber);
  const fssaiReviewed = Boolean(
    saved.progress?.fssaiVerified && saved.details?.fssaiNumber === d.fssaiNumber,
  );
  const bankDeferred = saved.bankEnrollmentRequired === false;
  return (
    <div className="cob-stack">
      <ReviewCard
        flow={flow}
        section="personal"
        icon={<UserRound size={20} aria-hidden="true" />}
        complete={completion.personal}
      >
        <Rows
          rows={[
            ["Full name", chefFullName(d)],
            ["Date of birth", d.dateOfBirth ? formatDateOfBirth(d.dateOfBirth) : ""],
            [
              "Mobile",
              saved.phoneNumber ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  {formatPhone(saved.phoneNumber)}
                  <CheckCircle2 size={15} aria-label="Verified" style={{ color: "#C4200F" }} />
                </span>
              ) : (
                ""
              ),
            ],
            [
              "Email",
              d.email ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  {d.email}
                  {completion.personal ? (
                    <CheckCircle2
                      size={15}
                      aria-label="Verified"
                      style={{ color: "#C4200F", flexShrink: 0 }}
                    />
                  ) : null}
                </span>
              ) : (
                ""
              ),
            ],
          ]}
        />
      </ReviewCard>

      <ReviewCard
        flow={flow}
        section="kitchen"
        icon={<Store size={20} aria-hidden="true" />}
        complete={completion.kitchen}
      >
        <Rows
          rows={[
            ["Kitchen name", d.kitchenName],
            ["Address", kitchenAddress(d)],
            ["Location", d.latitude != null && d.longitude != null ? "Pinned on map" : ""],
          ]}
        />
        <div className="cob-review-photos" style={{ marginTop: 14 }}>
          <ReviewPhoto flow={flow} type="KITCHEN_PHOTO_1" label="Overall kitchen" />
          <ReviewPhoto flow={flow} type="KITCHEN_PHOTO_2" label="Cooking setup" />
        </div>
      </ReviewCard>

      <ReviewCard
        flow={flow}
        section="fssai"
        icon={<ShieldCheck size={20} aria-hidden="true" />}
        complete={completion.fssai}
      >
        <Rows
          rows={[
            [
              "Status",
              fssaiReviewed ? "Verified by Craves" : fssaiAdded ? "Number added" : "Not added yet",
            ],
            [
              "Registration number",
              fssaiAdded ? <span className="cob-mono">{formatFssai(d.fssaiNumber)}</span> : "",
            ],
          ]}
        />
      </ReviewCard>

      <ReviewCard
        flow={flow}
        section="documents"
        icon={<IdCard size={20} aria-hidden="true" />}
        complete={completion.documents}
      >
        <Rows
          rows={[
            [
              "Document type",
              d.proofKind
                ? d.proofKind === "OTHER_GOVERNMENT_ID" && d.otherGovernmentId
                  ? d.otherGovernmentId
                  : PROOF_SHORT[d.proofKind]
                : "",
            ],
            ...(proofNeedsBack(d.proofKind)
              ? ([
                  ["Front side", uploaded("SELECTED_PROOF_FRONT") ? "Uploaded" : ""],
                  ["Back side", uploaded("SELECTED_PROOF_BACK") ? "Uploaded" : ""],
                ] as [string, string][])
              : ([["Document", uploaded("SELECTED_PROOF_FRONT") ? "Uploaded" : ""]] as [
                  string,
                  string,
                ][])),
          ]}
        />
      </ReviewCard>

      {bankDeferred ? (
        <section className="cob-card" aria-labelledby="review-bank">
          <div className="cob-review-head" style={{ marginBottom: 10 }}>
            <span className="cob-icon-well cob-icon-well--neutral">
              <Landmark size={20} aria-hidden="true" />
            </span>
            <div className="cob-card-title">
              <h2 id="review-bank">Bank details</h2>
              <StatusChip tone="idle">Add later</StatusChip>
            </div>
          </div>
          <p className="cob-helper" style={{ fontSize: 14 }}>
            You can add bank details later. They aren’t needed to submit your application for
            review.
          </p>
        </section>
      ) : (
        <ReviewCard
          flow={flow}
          section="bank"
          icon={<Building2 size={20} aria-hidden="true" />}
          complete={completion.bank}
        >
          <Rows
            rows={[
              ["Account holder", flow.bank?.accountHolderName || chefFullName(d)],
              ["Bank", flow.bank?.bankName ?? ""],
              [
                "Account",
                flow.bank?.lastFour ? (
                  <span className="cob-mono">•••• {flow.bank.lastFour}</span>
                ) : (
                  ""
                ),
              ],
              ["IFSC", flow.bank?.ifsc ?? ""],
            ]}
          />
          {flow.bank?.message && !completion.bank ? (
            <p className="cob-helper" style={{ marginTop: 10 }}>
              {flow.bank.message}
            </p>
          ) : null}
        </ReviewCard>
      )}

      <section className="cob-card">
        <label className="cob-check">
          <input
            type="checkbox"
            aria-label="Accept terms and privacy policy"
            checked={flow.terms}
            disabled={flow.busy}
            onChange={(event) => flow.setTerms(event.target.checked)}
          />
          <span>
            I confirm these details are correct and agree to the{" "}
            <Link href="/terms" target="_blank" rel="noopener noreferrer">
              Craves Chef Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" target="_blank" rel="noopener noreferrer">
              Privacy Policy
            </Link>
            .
          </span>
        </label>
      </section>
    </div>
  );
}

/** Renders a definition list row group; exported for the status and confirmation screens. */
export function SummaryRows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="cob-rows">
      {rows
        .filter(([, value]) => value)
        .map(([label, value]) => (
          <Fragment key={label}>
            <div className="cob-row">
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          </Fragment>
        ))}
    </dl>
  );
}
