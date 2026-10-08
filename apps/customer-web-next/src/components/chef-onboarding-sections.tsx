"use client";

import Link from "next/link";
import { Fragment, useEffect, useRef, useState } from "react";
import { CheckCircle2, LocateFixed, Search } from "lucide-react";
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
import { chefFullName, kitchenAddress, type ChefFormSection } from "@/lib/chef-onboarding-flow";
import { ChefOnboardingUpload } from "@/components/chef-onboarding-upload";
import { chefOnboardingApi, type ChefOnboardingFlow } from "@/components/use-chef-onboarding";

type Props = { flow: ChefOnboardingFlow };
type FieldProps = Props & {
  name: keyof OnboardingDetails;
  label: string;
  maxLength?: number;
  type?: string;
  helper?: string;
};
function Field({ flow, name, label, maxLength = 255, type = "text", helper }: FieldProps) {
  const error = flow.fieldError?.field === name ? flow.fieldError.message : null;
  return (
    <label className="chef-onboarding-field" htmlFor={`chef-${name}`}>
      {label}
      <input
        id={`chef-${name}`}
        aria-label={label}
        type={type}
        inputMode={name === "fssaiNumber" || name === "postalCode" ? "numeric" : undefined}
        className="chef-onboarding-input"
        value={String(flow.details[name] ?? "")}
        max={type === "date" ? new Date().toISOString().slice(0, 10) : undefined}
        min={type === "date" ? "1900-01-01" : undefined}
        maxLength={maxLength}
        disabled={flow.busy}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `chef-${name}-error` : undefined}
        onChange={(event) => flow.field(name, event.target.value as never)}
      />
      {error ? (
        <span id={`chef-${name}-error`} className="text-sm text-[#C4200F]">
          {error}
        </span>
      ) : helper ? (
        <span className="chef-onboarding-helper">{helper}</span>
      ) : null}
    </label>
  );
}
function Upload({
  flow,
  type,
  label,
  photo,
  helper,
}: Props & { type: string; label: string; photo?: boolean; helper?: string }) {
  return (
    <ChefOnboardingUpload
      type={type}
      label={label}
      photo={photo}
      helper={helper}
      disabled={flow.busy}
      evidence={flow.state?.documents.find((document) => document.documentType === type)}
      onUpload={flow.uploadFile}
          onRemove={flow.removeFile}
    />
  );
}
export function ChefBasicDetails({ flow }: Props) {
  const [name, setName] = useState(() => chefFullName(flow.details));
  const error = flow.fieldError?.field === "fullName" ? flow.fieldError.message : null;
  return (
    <div className="chef-onboarding-group">
      <label className="chef-onboarding-field" htmlFor="chef-fullName">
        Full name
        <input
          id="chef-fullName"
          autoComplete="name"
          className="chef-onboarding-input"
          value={name}
          maxLength={120}
          disabled={flow.busy}
          aria-invalid={Boolean(error)}
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
        {error ? <span className="text-sm text-[#C4200F]">{error}</span> : null}
      </label>
      <Field flow={flow} name="dateOfBirth" label="Date of birth" type="date" />
      <label className="chef-onboarding-field">
        Mobile number
        <input
          id="chef-phoneNumber"
          aria-label="Verified mobile number"
          className="chef-onboarding-input"
          value={flow.state?.phoneNumber ?? ""}
          readOnly
        />
        <span className="chef-onboarding-verified">
          <CheckCircle2 size={14} aria-hidden="true" />
          Verified
        </span>
      </label>
      <div id="chef-email" className="chef-onboarding-email" tabIndex={-1}>
        <EmailVerificationPanel
          required
          compact
          initialEmail={flow.details.email}
          onStateChange={flow.onEmail}
        />
      </div>
    </div>
  );
}

export function ChefKitchenDetails({ flow }: Props) {
  const [query, setQuery] = useState(""),
    [results, setResults] = useState<LocationSearchResult[]>([]);
  const [locating, setLocating] = useState(false),
    [searching, setSearching] = useState(false),
    [locationError, setLocationError] = useState("");
  const generation = useRef(0),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function pin(latitude: number, longitude: number) {
    const request = ++generation.current;
    flow.updateDetails((previous) => ({ ...previous, latitude, longitude }));
    setLocationError("");
    setLocating(true);
    try {
      const address = await reverseGeocodeCurrentLocation(latitude, longitude);
      if (!mounted.current || request !== generation.current) return;
      flow.updateDetails((previous) => ({
        ...previous,
        addressLine1: address.houseNumber ?? address.formattedAddress,
        addressLine2: [address.street, address.area].filter(Boolean).join(", "),
        city: address.city ?? previous.city,
        state: address.state ?? previous.state,
        postalCode: address.postalCode ?? previous.postalCode,
      }));
    } catch {
      if (mounted.current && request === generation.current)
        setLocationError(
          "Your pin is selected. We could not fill the address automatically; enter or correct the fields below.",
        );
    } finally {
      if (mounted.current && request === generation.current) setLocating(false);
    }
  }
  async function locate() {
    if (!navigator.geolocation) {
      setLocationError(
        "Location access is unavailable. Search for your address or move the map pin.",
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
    } catch {
      if (mounted.current && request === generation.current) {
        setLocationError(
          "Allow location access in your browser, or search for your kitchen address.",
        );
        setLocating(false);
      }
    }
  }
  async function search() {
    if (query.trim().length < 3) {
      setLocationError("Enter at least three characters to search.");
      return;
    }
    const request = ++generation.current;
    setSearching(true);
    setLocationError("");
    setResults([]);
    try {
      const found = await searchLocations(
        query.trim(),
        flow.details.latitude != null && flow.details.longitude != null
          ? { latitude: flow.details.latitude, longitude: flow.details.longitude }
          : undefined,
      );
      if (!mounted.current || request !== generation.current) return;
      setResults(found);
      if (!found.length)
        setLocationError(
          "No matching address found. Try a nearby area or choose a location on the map.",
        );
    } catch (failure) {
      if (mounted.current && request === generation.current)
        setLocationError(
          failure instanceof Error
            ? failure.message
            : "Address search is unavailable. Choose a map location instead.",
        );
    } finally {
      if (mounted.current && request === generation.current) setSearching(false);
    }
  }
  return (
    <div className="chef-onboarding-group">
      <Field flow={flow} name="kitchenName" label="Kitchen name" maxLength={160} />
      <label className="chef-onboarding-field">
        Kitchen description <span className="chef-onboarding-helper">Optional</span>
        <textarea
          aria-label="Kitchen description"
          className="chef-onboarding-input"
          rows={3}
          maxLength={1000}
          disabled={flow.busy}
          value={flow.details.kitchenDescription}
          onChange={(event) => flow.field("kitchenDescription", event.target.value)}
        />
      </label>
      <section id="chef-location" tabIndex={-1} aria-label="Kitchen location">
        <h2 className="mb-3 text-sm font-bold">Kitchen location</h2>
        <AddressMapPicker
          latitude={flow.details.latitude ?? 20.5937}
          longitude={flow.details.longitude ?? 78.9629}
          disabled={flow.busy || searching}
          locating={locating}
          onCenterChange={(point) => void pin(point.latitude, point.longitude)}
          onUseCurrentLocation={() => void locate()}
        />
        <button
          type="button"
          className="chef-onboarding-text-action mt-3"
          disabled={flow.busy || locating}
          onClick={() => void locate()}
        >
          <LocateFixed size={17} aria-hidden="true" />
          {locating ? "Finding your location" : "Use my current location"}
        </button>
        <p className="chef-onboarding-helper mt-1">
          Search for your address or move the map to your kitchen. Check the address before
          continuing.
        </p>
        <label className="chef-onboarding-field mt-4">
          Search address
          <div className="flex gap-2">
            <input
              aria-label="Search kitchen address"
              className="chef-onboarding-input min-w-0"
              autoComplete="off"
              value={query}
              maxLength={200}
              disabled={flow.busy}
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
              className="chef-onboarding-text-action px-3"
              disabled={flow.busy || searching}
              onClick={() => void search()}
            >
              <Search size={20} aria-hidden="true" />
            </button>
          </div>
        </label>
        {searching ? (
          <p role="status" className="chef-onboarding-helper mt-2">
            Searching addresses…
          </p>
        ) : null}
        {results.length ? (
          <ul className="mt-3 rounded-xl border border-[#d5d9df]">
            {results.map((result) => (
              <li key={result.id}>
                <button
                  type="button"
                  className="min-h-12 w-full p-3 text-left text-sm hover:bg-[#F1F3F5]"
                  onClick={() => {
                    setResults([]);
                    setQuery(result.formattedAddress);
                    void pin(result.latitude, result.longitude);
                  }}
                >
                  {result.formattedAddress}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {locationError || flow.fieldError?.field === "location" ? (
          <p role="alert" className="chef-onboarding-notice chef-onboarding-error">
            {locationError || flow.fieldError?.message}
          </p>
        ) : null}
      </section>
      <div
        className="chef-onboarding-group"
        onChange={() => {
          generation.current++;
          setLocating(false);
          setSearching(false);
        }}
      >
        <Field flow={flow} name="addressLine1" label="House / building" />
        <Field flow={flow} name="addressLine2" label="Street / area" />
        <Field flow={flow} name="landmark" label="Landmark" helper="Optional" />
        <div className="chef-onboarding-pair">
          <Field flow={flow} name="city" label="City" maxLength={80} />
          <Field flow={flow} name="state" label="State" maxLength={80} />
        </div>
        <Field flow={flow} name="postalCode" label="PIN code" maxLength={6} />
      </div>
      <section className="chef-onboarding-section">
        <h2>Kitchen photos</h2>
        <p className="chef-onboarding-helper mb-4">
          Two clear photos help us understand your kitchen.
        </p>
        <div className="chef-onboarding-group">
          <Upload
            flow={flow}
            type="KITCHEN_PHOTO_1"
            label="Overall kitchen photo"
            photo
            helper="Show your kitchen and preparation area."
          />
          <Upload
            flow={flow}
            type="KITCHEN_PHOTO_2"
            label="Cooking setup photo"
            photo
            helper="Show your cooking equipment and workspace."
          />
        </div>
      </section>
    </div>
  );
}

export function ChefFssaiDetails({ flow }: Props) {
  const [guide, setGuide] = useState(false),
    [content, setContent] = useState<LearningContent[]>([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const [playback, setPlayback] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!guide) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setContent([]);
    setPlayback({});
    void fetch(
      "/api/chef/onboarding/content?language=" + encodeURIComponent(flow.details.language),
      { cache: "no-store", credentials: "same-origin", signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            "Learning content is unavailable right now. You can still use the guide below or request a callback.",
          );
        const raw: unknown = await response.json();
        if (
          !Array.isArray(raw) ||
          raw.length > 100 ||
          raw.some(
            (item) =>
              !item ||
              typeof item !== "object" ||
              !/^[0-9a-f-]{36}$/i.test(item.id) ||
              typeof item.title !== "string" ||
              !["ARTICLE", "VIDEO"].includes(item.kind) ||
              typeof item.language !== "string" ||
              !(item.body == null || typeof item.body === "string"),
          )
        )
          throw new Error("Learning content could not be verified. Please try again later.");
        if (!controller.signal.aborted)
          setContent(
            (raw as LearningContent[]).filter(
              (item) =>
                item.published === true &&
                item.ready === true &&
                item.language === flow.details.language,
            ),
          );
      })
      .catch((failure) => {
        if (!controller.signal.aborted)
          setError(failure instanceof Error ? failure.message : "Learning content is unavailable.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [guide, flow.details.language]);
  return (
    <div className="chef-onboarding-group">
      {!guide ? (
        <>
          <Field
            flow={flow}
            name="fssaiNumber"
            label="FSSAI registration number"
            maxLength={14}
            helper="Enter the 14-digit number on your registration or licence."
          />
          <button
            type="button"
            className="chef-onboarding-text-action justify-start"
            disabled={flow.busy}
            onClick={() => setGuide(true)}
          >
            Don’t have FSSAI?
          </button>
        </>
      ) : (
        <>
          <h2 className="text-lg font-bold">Apply for FSSAI registration</h2>
          <ol className="chef-onboarding-guide">
            <li>
              <strong>Open the official FoSCoS website</strong>
              <p>
                Visit{" "}
                <a
                  className="text-[#C4200F] underline"
                  href="https://foscos.fssai.gov.in/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  FoSCoS
                </a>{" "}
                and choose the option to apply for a new licence or registration.
              </p>
            </li>
            <li>
              <strong>Check your eligibility</strong>
              <p>
                Select your state and food business activity, then follow the portal’s eligibility
                guidance.
              </p>
            </li>
            <li>
              <strong>Complete your application</strong>
              <p>
                Enter your business and kitchen details and provide the documents requested by
                FoSCoS.
              </p>
            </li>
            <li>
              <strong>Submit and pay on FoSCoS</strong>
              <p>Check your application carefully and pay the fee shown on the official portal.</p>
            </li>
            <li>
              <strong>Track your application</strong>
              <p>
                Keep your reference number. Once your registration is issued, return here to add its
                14-digit number.
              </p>
            </li>
          </ol>
          <section className="chef-onboarding-section">
            <h2>Learn in your language</h2>
            <label className="chef-onboarding-field">
              Preferred language
              <select
                aria-label="Preferred language"
                className="chef-onboarding-input"
                disabled={flow.busy}
                value={flow.details.language}
                onChange={(event) => flow.field("language", event.target.value)}
              >
                {ONBOARDING_LANGUAGES.map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {loading ? (
              <p role="status" className="chef-onboarding-helper mt-4">
                Loading learning content…
              </p>
            ) : null}
            {error ? (
              <p role="alert" className="chef-onboarding-notice chef-onboarding-error">
                {error}
              </p>
            ) : null}
            {!loading && !error && !content.length ? (
              <p className="chef-onboarding-notice">
                No learning content is published in this language yet. Use the guide above or
                request a callback.
              </p>
            ) : null}
            {content.map((item) => (
              <article key={item.id} className="mt-5" lang={item.language}>
                <h3 className="font-bold">{item.title}</h3>
                {item.kind === "ARTICLE" ? (
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-[#6B6B6B]">
                    {item.body}
                  </p>
                ) : playback[item.id] ? (
                  <video
                    className="mt-3 aspect-video w-full rounded-xl bg-[#F1F3F5]"
                    controls
                    preload="metadata"
                    src={playback[item.id]}
                    onError={() =>
                      setError(
                        "Video access expired or playback failed. Refresh video access to try again.",
                      )
                    }
                  />
                ) : null}
                {item.kind === "VIDEO" ? (
                  <button
                    type="button"
                    className="chef-onboarding-text-action mt-2"
                    disabled={flow.busy}
                    onClick={() =>
                      void flow.work(async () => {
                        const result = await chefOnboardingApi(
                          `/api/chef/onboarding/content/${item.id}/playback`,
                        );
                        if (
                          !result ||
                          typeof result !== "object" ||
                          !("url" in result) ||
                          typeof result.url !== "string" ||
                          !result.url.startsWith("https://")
                        )
                          throw new Error("Video access could not be confirmed.");
                        setPlayback((previous) => ({
                          ...previous,
                          [item.id]: result.url as string,
                        }));
                      })
                    }
                  >
                    {playback[item.id] ? "Refresh video access" : "Watch video"}
                  </button>
                ) : null}
              </article>
            ))}
          </section>
          <section className="chef-onboarding-section">
            <h2>Need a hand?</h2>
            <p className="chef-onboarding-helper">
              Our team can help you apply. Your saved details and verified contact information will
              accompany your request.
            </p>
            {flow.callbackCase ? (
              <p role="status" className="chef-onboarding-notice">
                Your callback request is confirmed. Reference: {flow.callbackCase}. Our team will
                contact your verified mobile number.
              </p>
            ) : (
              <button
                type="button"
                className="chef-onboarding-text-action mt-3"
                disabled={flow.busy}
                onClick={() => void flow.requestCallback()}
              >
                Request a callback
              </button>
            )}
          </section>
          <button
            type="button"
            className="chef-onboarding-text-action justify-start"
            disabled={flow.busy}
            onClick={() => setGuide(false)}
          >
            I have my FSSAI number
          </button>
          <button
            type="button"
            className="chef-onboarding-text-action justify-start"
            disabled={flow.busy}
            onClick={() =>
              void flow.work(async () => {
                await flow.persist();
                flow.setNotice("Your progress is saved. Add your FSSAI number when you are ready.");
              })
            }
          >
            Save progress for later
          </button>
        </>
      )}
    </div>
  );
}

export function ChefIdentityDetails({ flow }: Props) {
  const selected = PROOF_OPTIONS.find(([key]) => key === flow.details.proofKind)?.[1] ?? "Document";
  return (
    <div className="chef-onboarding-group">
      <label className="chef-onboarding-field">
        Identity document
        <select
          id="chef-proofKind"
          aria-label="Identity document"
          className="chef-onboarding-input"
          value={flow.details.proofKind ?? ""}
          disabled={
            flow.busy ||
            flow.state?.documents.some((document) =>
              document.documentType.startsWith("SELECTED_PROOF_"),
            )
          }
          onChange={(event) => flow.field("proofKind", event.target.value as ProofKind)}
        >
          <option value="" disabled>
            Select a document
          </option>
          {PROOF_OPTIONS.map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {flow.details.proofKind === "OTHER_GOVERNMENT_ID" ? (
        <Field flow={flow} name="otherGovernmentId" label="Government ID name" maxLength={80} />
      ) : null}
      <p className="chef-onboarding-helper">
        PAN cards and bank statements need one file. Aadhaar and other government IDs need front and
        back. Use a clear JPG, PNG or PDF, up to 10 MB.
      </p>
      {flow.details.proofKind ? (
        <>
          <Upload
            flow={flow}
            type="SELECTED_PROOF_FRONT"
            label={selected + (proofNeedsBack(flow.details.proofKind) ? " - front" : "")}
          />
          {proofNeedsBack(flow.details.proofKind) ? (
            <Upload flow={flow} type="SELECTED_PROOF_BACK" label={selected + " - back"} />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
function ReviewBlock({
  title,
  section,
  rows,
  flow,
}: Props & { title: string; section: ChefFormSection; rows: [string, string][] }) {
  return (
    <section className="chef-onboarding-review-block">
      <header>
        <h2>{title}</h2>
        <button
          type="button"
          className="chef-onboarding-text-action"
          aria-label={`Edit ${title}`}
          disabled={flow.busy}
          onClick={() => flow.edit(section)}
        >
          Edit
        </button>
      </header>
      <dl>
        {rows.map(([label, value]) => (
          <Fragment key={label}>
            <dt>{label}</dt>
            <dd>{value || "Not added"}</dd>
          </Fragment>
        ))}
      </dl>
    </section>
  );
}
export function ChefReviewDetails({ flow }: Props) {
  const d = flow.details,
    saved = flow.state;
  return (
    <div className="chef-onboarding-review">
      <ReviewBlock
        flow={flow}
        section="personal"
        title="Basic details"
        rows={[
          ["Full name", chefFullName(d)],
          ["Date of birth", d.dateOfBirth],
          ["Mobile number", saved?.phoneNumber ?? ""],
          ["Email", d.email],
        ]}
      />
      <ReviewBlock
        flow={flow}
        section="kitchen"
        title="Kitchen details"
        rows={[
          ["Kitchen name", d.kitchenName],
          ["Description", d.kitchenDescription || "Not provided"],
          ["Address", kitchenAddress(d)],
          [
            "Kitchen photos",
            `${saved?.documents.filter((document) => ["KITCHEN_PHOTO_1", "KITCHEN_PHOTO_2"].includes(document.documentType) && document.status !== "REJECTED").length ?? 0} of 2 uploaded`,
          ],
        ]}
      />
      <ReviewBlock
        flow={flow}
        section="fssai"
        title="FSSAI details"
        rows={[["Registration number", d.fssaiNumber]]}
      />
      <ReviewBlock
        flow={flow}
        section="documents"
        title="Identity documents"
        rows={[
          ["Document type", PROOF_OPTIONS.find(([key]) => key === d.proofKind)?.[1] ?? ""],
          [
            "Uploaded documents",
            saved?.documents
              .filter((document) => document.documentType.startsWith("SELECTED_PROOF_"))
              .map((document) => document.originalFileName)
              .join(", ") ?? "",
          ],
        ]}
      />
      <ReviewBlock
        flow={flow}
        section="bank"
        title="Bank details"
        rows={[
          ["Account holder", chefFullName(d)],
          ["Account", flow.bank?.lastFour ? "•••• " + flow.bank.lastFour : ""],
          ["IFSC", flow.bank?.ifsc ?? ""],
          ["Verification", flow.bank?.message ?? ""],
        ]}
      />
      <label className="mt-3 flex items-start gap-3 text-sm leading-6">
        <input
          type="checkbox"
          aria-label="Accept terms and privacy policy"
          className="mt-1 h-5 w-5 shrink-0 accent-[#C4200F]"
          checked={flow.terms}
          disabled={flow.busy}
          onChange={(event) => flow.setTerms(event.target.checked)}
        />
        <span>
          I confirm these details are correct and agree to the{" "}
          <Link
            href="/terms"
            className="text-[#C4200F] underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Terms and Conditions
          </Link>{" "}
          and{" "}
          <Link
            href="/privacy"
            className="text-[#C4200F] underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Privacy Policy
          </Link>
          .
        </span>
      </label>
    </div>
  );
}
