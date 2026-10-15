"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronRight,
  Copy,
  FileText,
  Gift,
  Info,
  Loader2,
  Share2,
} from "lucide-react";
import {
  enrollInChefReferrals,
  fetchChefReferralEarnings,
  fetchReferralCode,
  fetchReferralOverview,
  ReferralError,
} from "@/features/chef/api/chef-referrals";
import {
  ChefEmpty,
  ChefFlash,
  ChefSection,
  ChefSkeleton,
  timeAgo,
} from "@/features/chef/components/chef-ui";
import { CHEF_ERROR_MESSAGES } from "@/features/chef/lib/chef-errors";
import {
  REFERRAL_NOT_ENROLLED,
  REFERRAL_TERMS_CHANGED,
  referralRupees,
  type ChefReferralEarnings,
  type ReferralCode,
  type ReferralOverview,
} from "@/features/chef/lib/chef-referral-contract";
import {
  CHEF_REFERRAL_RATES_BPS,
  CHEF_REFERRAL_TERMS,
  CHEF_REFERRAL_TERMS_VERSION_LABEL,
} from "@/features/chef/lib/chef-referral-terms";
import { FEATURE_NOT_AVAILABLE } from "@/shared/lib/feature-availability";
import { ComingSoon } from "@/shared/ui/feedback/ComingSoon";
import { Sheet } from "@/shared/ui/overlays/overlay";

type Read<T> =
  | { kind: "loading" }
  | { kind: "ready"; data: T }
  | { kind: "notJoined" }
  | { kind: "soon" }
  | { kind: "failed"; message: string };

const CHECK_EVERY_MS = 3_000;
const GIVE_UP_AFTER_MS = 60_000;
const LOAD_FAILED = "Check your connection and try again.";
const SOON = "Coming soon";
const sum = (values: string[]) => values.reduce((total, value) => total + Number(value), 0);

function asReferralError(error: unknown): ReferralError {
  return error instanceof ReferralError ? error : new ReferralError("NETWORK_ERROR", 0);
}
/** Not a member yet, or the terms the chef accepted are out of date: either way the join step shows. */
function needsJoining(error: ReferralError): boolean {
  return (
    (error.status === 403 && error.code === REFERRAL_NOT_ENROLLED) ||
    (error.status === 409 && error.code === REFERRAL_TERMS_CHANGED)
  );
}
function readFailure<T>(error: ReferralError): Read<T> {
  if (needsJoining(error)) return { kind: "notJoined" };
  if (error.code === FEATURE_NOT_AVAILABLE) return { kind: "soon" };
  return { kind: "failed", message: CHEF_ERROR_MESSAGES[error.code] ?? LOAD_FAILED };
}

function TermsList() {
  return (
    <div className="grid gap-3 text-[0.875rem] leading-6 text-[#6B6B6B]">
      <ol className="grid gap-3">
        {CHEF_REFERRAL_TERMS.map((term, index) => (
          <li key={term.title} className="whitespace-pre-line">
            <strong className="text-[#1A1A1A]">{`${index + 1}. ${term.title}`}</strong> {term.body}
          </li>
        ))}
      </ol>
      <p className="italic">{CHEF_REFERRAL_TERMS_VERSION_LABEL}</p>
    </div>
  );
}

type JoinStep = "form" | "settingUp" | "slow" | "termsChanged" | "soon" | "failed";

/** For a chef whose account is older than the programme: read the terms, accept, join, then wait for the invite link. */
function ChefReferralJoin({
  onJoined,
  onCheck,
  checking,
}: {
  onJoined(): void;
  onCheck(): Promise<ReferralError | null>;
  checking: boolean;
}) {
  const [step, setStep] = useState<JoinStep>("form");
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checkFailed, setCheckFailed] = useState(false);
  const [terms, setTerms] = useState(false);
  const sending = useRef(false);

  // The invite link appears a few seconds after joining: ask every 3 s (not while the tab is hidden) for up to a minute.
  useEffect(() => {
    if (step !== "settingUp") return;
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") void onCheck();
    }, CHECK_EVERY_MS);
    const giveUp = setTimeout(() => setStep("slow"), GIVE_UP_AFTER_MS);
    return () => {
      clearInterval(poll);
      clearTimeout(giveUp);
    };
  }, [step, onCheck]);

  async function join() {
    if (!accepted || sending.current) return;
    sending.current = true;
    setBusy(true);
    try {
      await enrollInChefReferrals();
      onJoined();
      setStep("settingUp");
    } catch (error) {
      const failure = asReferralError(error);
      setStep(
        failure.status === 409 && failure.code === REFERRAL_TERMS_CHANGED
          ? "termsChanged"
          : failure.code === FEATURE_NOT_AVAILABLE
            ? "soon"
            : "failed",
      );
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  async function checkAgain() {
    setCheckFailed(false);
    const error = await onCheck();
    // Not a member yet is the normal wait; any other answer means the check itself did not go through.
    setCheckFailed(error !== null && !needsJoining(error));
  }

  if (step === "soon")
    return (
      <ComingSoon
        title="Joining is coming soon"
        message="You’ll be able to join the referral programme here soon."
      />
    );
  if (step === "failed")
    return (
      <ChefSection>
        <ChefEmpty
          icon={AlertTriangle}
          title="We couldn’t load this"
          text={LOAD_FAILED}
          action={
            <button
              type="button"
              className="chef-btn"
              aria-busy={busy}
              disabled={busy}
              onClick={() => void join()}
            >
              Try again
            </button>
          }
        />
      </ChefSection>
    );
  if (step !== "form")
    return (
      <ChefSection>
        <div className="grid justify-items-center gap-3 py-4 text-center">
          {step === "settingUp" ? (
            <Loader2
              className="h-6 w-6 animate-spin text-[#6B6B6B] motion-reduce:animate-none"
              aria-hidden="true"
            />
          ) : null}
          <p
            role={step === "termsChanged" ? "alert" : "status"}
            className="text-[0.9375rem] font-semibold text-[#1A1A1A]"
          >
            {step === "settingUp"
              ? "Setting up your invite link…"
              : step === "slow"
                ? "Your invite link is still being set up. Check again in a few minutes."
                : "The referral terms have changed. Joining will be back here soon."}
          </p>
          {checkFailed ? (
            <p role="alert" className="text-[0.875rem] text-[#6B6B6B]">
              We couldn’t check right now. Try again.
            </p>
          ) : null}
          {step === "termsChanged" ? null : (
            <button
              type="button"
              className="chef-btn is-block"
              aria-busy={checking}
              disabled={checking}
              onClick={() => void checkAgain()}
            >
              Check again
            </button>
          )}
        </div>
      </ChefSection>
    );

  return (
    <>
      <ChefSection>
        <span className="chef-empty-icon">
          <Gift className="h-6 w-6" aria-hidden="true" />
        </span>
        <h2 className="chef-section-title mt-3">Join the chef referral programme</h2>
        <div className="mt-1.5 grid gap-1.5 text-[0.875rem] leading-6 text-[#6B6B6B]">
          <p>
            You earn a share of the food sales of chefs you invite, and of the chefs they invite, up
            to three levels. It comes from Craves’ commission, never from their earnings.
          </p>
          <p>You already have an account, so you join without a referrer.</p>
          <p>Rewards are held for 24 hours before they count.</p>
        </div>
      </ChefSection>
      <div className="chef-section chef-list">
        <button
          type="button"
          className="chef-row w-full !border-0 !bg-transparent text-left"
          onClick={() => setTerms(true)}
        >
          <span className="chef-row-icon">
            <FileText className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="chef-row-main">
            <span className="chef-row-title block">Read the full terms</span>
          </span>
          <ChevronRight className="chef-chevron h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      <label className="flex min-h-12 cursor-pointer items-center gap-3 text-[0.9375rem] text-[#1A1A1A]">
        <input
          type="checkbox"
          className="h-5 w-5 shrink-0 accent-[#1A1A1A]"
          checked={accepted}
          onChange={(event) => setAccepted(event.target.checked)}
        />
        I accept the referral terms
      </label>
      <button
        type="button"
        className="chef-btn is-primary is-block"
        aria-busy={busy}
        disabled={!accepted || busy}
        onClick={() => void join()}
      >
        {busy ? "Joining…" : "Join"}
      </button>
      <Sheet open={terms} onOpenChange={setTerms} title="Referral terms">
        <div className="mt-4">
          <TermsList />
        </div>
      </Sheet>
    </>
  );
}

function EarningsSection({
  earnings,
  onRetry,
}: {
  earnings: Read<ChefReferralEarnings>;
  onRetry(): void;
}) {
  if (earnings.kind === "soon")
    return (
      <ComingSoon
        title="Referral earnings are on their way"
        message="The credits you earn from chefs you invite will be listed here soon."
      />
    );
  const data = earnings.kind === "ready" ? earnings.data : null;
  const cap = Number(data?.monthlyCapPaise ?? 0);
  const percent =
    data && cap > 0
      ? Math.max(0, Math.min(100, Math.round((Number(data.monthUsedPaise) / cap) * 100)))
      : 0;
  return (
    <ChefSection
      title="Referral earnings"
      labelledBy="chef-referral-earnings"
      note={
        data
          ? `${referralRupees(data.monthUsedPaise)} this month · limit ${referralRupees(data.monthlyCapPaise)}`
          : undefined
      }
      flush
    >
      {earnings.kind === "loading" ? (
        <div className="grid gap-2 px-4 pb-4 md:px-5" aria-busy="true">
          <ChefSkeleton className="h-6 w-28 !rounded-md" />
          <ChefSkeleton className="h-2.5 w-full !rounded-full" />
        </div>
      ) : !data ? (
        <ChefEmpty
          icon={AlertTriangle}
          title="We couldn’t load this"
          text={earnings.kind === "failed" ? earnings.message : LOAD_FAILED}
          action={
            <button type="button" className="chef-btn" onClick={onRetry}>
              Try again
            </button>
          }
        />
      ) : (
        <>
          <div className="px-4 pb-4 md:px-5">
            <p className="text-[0.8125rem] font-semibold text-[#6B6B6B]">This month</p>
            <p className="chef-amount font-display text-[1.75rem] font-bold leading-tight text-[#1A1A1A]">
              {referralRupees(data.monthUsedPaise)}
            </p>
            <p className="text-[0.8125rem] text-[#6B6B6B]">
              of {referralRupees(data.monthlyCapPaise)} monthly limit
            </p>
            <div
              role="progressbar"
              aria-label="This month’s referral limit used"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              className="my-2 h-2.5 overflow-hidden rounded-full bg-[#E3E6EA]"
            >
              <div className="h-full rounded-full bg-[#C4200F]" style={{ width: `${percent}%` }} />
            </div>
            <p className="text-[0.8125rem] text-[#6B6B6B]">
              {referralRupees(data.monthRemainingPaise)} left this month
            </p>
          </div>
          <h3 className="border-t border-[#E3E6EA] px-4 pt-3 text-[0.9375rem] font-semibold text-[#1A1A1A] md:px-5">
            Credits
          </h3>
          {data.recentPostings.length === 0 ? (
            <p className="px-4 py-4 text-center text-[0.9375rem] text-[#6B6B6B] md:px-5">
              No referral credits yet
            </p>
          ) : (
            <ul className="chef-list mt-1">
              {data.recentPostings.map((posting) => {
                const reversal = Number(posting.amountPaise) < 0;
                return (
                  <li key={posting.id} className="chef-row">
                    <span className="chef-row-main">
                      <span className="chef-row-title block">
                        {reversal ? "Referral reversal" : "Referral credit"}
                      </span>
                      <span className="chef-row-meta block">{timeAgo(posting.postedAt)}</span>
                    </span>
                    <span
                      className={`chef-row-value chef-amount ${reversal ? "text-[#C4200F]" : ""}`}
                    >
                      {reversal ? "−" : "+"}
                      {referralRupees(Math.abs(Number(posting.amountPaise)))}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="border-t border-[#E3E6EA] px-4 py-3 text-[0.8125rem] text-[#6B6B6B] md:px-5">
            Referral credits are added to your chef earnings.
          </p>
        </>
      )}
    </ChefSection>
  );
}

/**
 * Refer a chef: the invite code to copy or share, what it has earned, and the rules.
 * A chef whose account is older than the programme has no code yet and joins here first.
 */
export function ChefReferrals() {
  const [code, setCode] = useState<Read<ReferralCode>>({ kind: "loading" });
  const [earnings, setEarnings] = useState<Read<ChefReferralEarnings>>({ kind: "loading" });
  const [overview, setOverview] = useState<Read<ReferralOverview>>({ kind: "loading" });
  // True from the server taking the join request until the invite link arrives.
  const [joined, setJoined] = useState(false);
  const [checking, setChecking] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [rules, setRules] = useState(false);
  const [notice, setNotice] = useState("");
  const [problem, setProblem] = useState("");

  const reading = useRef(false);
  const readCode = useCallback(async (): Promise<ReferralError | null> => {
    // One read at a time, so a slow reply can never land after (and undo) a newer one.
    if (reading.current) return null;
    reading.current = true;
    setChecking(true);
    try {
      setCode({ kind: "ready", data: await fetchReferralCode() });
      return null;
    } catch (error) {
      const failure = asReferralError(error);
      setCode(readFailure(failure));
      return failure;
    } finally {
      reading.current = false;
      setChecking(false);
    }
  }, []);
  const readEarnings = useCallback(async () => {
    setEarnings({ kind: "loading" });
    try {
      setEarnings({ kind: "ready", data: await fetchChefReferralEarnings() });
    } catch (error) {
      setEarnings(readFailure(asReferralError(error)));
    }
  }, []);
  useEffect(() => {
    void readCode();
  }, [readCode]);
  // Earnings and the overview are refused until the chef is a member: read them once the invite is there.
  const ready = code.kind === "ready";
  useEffect(() => {
    if (!ready) return;
    void readEarnings();
    fetchReferralOverview().then(
      (data) => setOverview({ kind: "ready", data }),
      (error: unknown) => setOverview(readFailure(asReferralError(error))),
    );
  }, [ready, readEarnings]);

  async function copy(text: string, done: string) {
    setProblem("");
    try {
      await navigator.clipboard.writeText(text);
      setNotice(done);
    } catch {
      setProblem("We couldn’t copy it. Select the code and copy it yourself.");
    }
  }
  async function share(invite: ReferralCode) {
    if (sharing) return;
    const text = `Join Craves as a home chef.\nReferral code: ${invite.code}\n${invite.link}`;
    setSharing(true);
    try {
      if (typeof navigator.share === "function")
        await navigator.share({ text }).catch(() => undefined); // closing the share sheet is fine
      else await copy(text, "Invite copied. Paste it in a message.");
    } finally {
      setSharing(false);
    }
  }

  const feedback = (
    <>
      <ChefFlash message={notice} onClose={() => setNotice("")} />
      <ChefFlash message={problem} tone="danger" onClose={() => setProblem("")} />
    </>
  );

  if (code.kind !== "ready" && (code.kind === "notJoined" || joined))
    return (
      <div className="chef-stack">
        <ChefReferralJoin checking={checking} onCheck={readCode} onJoined={() => setJoined(true)} />
      </div>
    );
  if (code.kind === "loading")
    return (
      <div className="chef-stack" aria-busy="true" aria-label="Loading your invite">
        <ChefSkeleton className="h-56 w-full" />
        <ChefSkeleton className="h-24 w-full" />
      </div>
    );
  if (code.kind === "soon")
    return (
      <ComingSoon
        title="Referrals are on their way"
        message="Inviting other chefs and seeing what you earn will be here soon."
      />
    );
  if (code.kind !== "ready")
    return (
      <ChefSection>
        <ChefEmpty
          icon={AlertTriangle}
          title="We couldn’t load this"
          text={code.kind === "failed" ? code.message : LOAD_FAILED}
          action={
            <button
              type="button"
              className="chef-btn"
              aria-busy={checking}
              disabled={checking}
              onClick={() => void readCode()}
            >
              Try again
            </button>
          }
        />
      </ChefSection>
    );

  const invite = code.data;
  // The app's tiles come from the overview; null while it loads.
  const numbers =
    overview.kind === "ready"
      ? {
          joined: String(sum(overview.data.downline.map((level) => level.members))),
          onHold: referralRupees(overview.data.pendingPaise),
          earned: referralRupees(sum(overview.data.levels.map((level) => level.netEarnedPaise))),
        }
      : null;
  const noNumber = overview.kind === "loading" ? null : overview.kind === "soon" ? SOON : "—";
  // Until the gateway publishes the overview, Earned comes from the chef earnings.
  const earnedSoFar =
    earnings.kind === "ready"
      ? referralRupees(earnings.data.netRecordedPaise)
      : earnings.kind === "loading"
        ? null
        : earnings.kind === "soon"
          ? SOON
          : "—";
  return (
    <div className="chef-stack">
      <ChefSection>
        <div className="grid justify-items-center gap-1 text-center">
          <span className="chef-empty-icon">
            <Gift className="h-6 w-6" aria-hidden="true" />
          </span>
          <h2 className="chef-section-title mt-2">Invite home chefs you know</h2>
          <p className="text-[0.875rem] text-[#6B6B6B]">
            You earn a share of the sales of chefs you invite.
          </p>
        </div>
        <div className="mt-4 flex items-center justify-between gap-2 rounded-xl border-2 border-dashed border-[#D3D7DD] bg-white py-1 pl-4 pr-1">
          <p className="min-w-0 select-all break-all font-display text-[1.0625rem] font-extrabold tracking-[0.12em] text-[#1A1A1A]">
            <span className="sr-only">Your referral code: </span>
            {invite.code}
          </p>
          <button
            type="button"
            className="chef-btn is-small shrink-0"
            onClick={() => void copy(invite.code, "Copied")}
          >
            <Copy className="h-4 w-4" aria-hidden="true" />
            Copy
          </button>
        </div>
        <button
          type="button"
          className="chef-btn is-primary is-block mt-3"
          aria-busy={sharing}
          disabled={sharing}
          onClick={() => void share(invite)}
        >
          <Share2 className="h-4 w-4" aria-hidden="true" />
          Share invite
        </button>
      </ChefSection>

      <ChefSection flush>
        <div className="chef-stats is-three" aria-busy={overview.kind === "loading"}>
          {(
            [
              ["Joined", numbers?.joined ?? noNumber],
              ["On hold", numbers?.onHold ?? noNumber],
              ["Earned", numbers?.earned ?? (overview.kind === "soon" ? earnedSoFar : noNumber)],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="chef-stat">
              <p className="chef-stat-label">{label}</p>
              {value === null ? (
                <ChefSkeleton className="mt-1.5 h-6 w-20 !rounded-md" />
              ) : (
                <p
                  className={
                    value === SOON
                      ? "mt-1 text-[0.9375rem] font-semibold text-[#6B6B6B]"
                      : "chef-stat-value chef-amount"
                  }
                >
                  {value}
                </p>
              )}
            </div>
          ))}
        </div>
      </ChefSection>

      <EarningsSection earnings={earnings} onRetry={() => void readEarnings()} />

      <div className="chef-section chef-list">
        <button
          type="button"
          className="chef-row w-full !border-0 !bg-transparent text-left"
          onClick={() => setRules(true)}
        >
          <span className="chef-row-icon">
            <Info className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="chef-row-main">
            <span className="chef-row-title block">How it works</span>
            <span className="chef-row-meta block">Rates and rules</span>
          </span>
          <ChevronRight className="chef-chevron h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <Sheet open={rules} onOpenChange={setRules} title="How it works">
        {/* Sheets open outside the chef page: the theme brings the chef colours along. */}
        <div className="chef-panel-theme chef-sheet-theme mt-4">
          <ul className="chef-list rounded-xl border border-[#E3E6EA]">
            {CHEF_REFERRAL_RATES_BPS.map((bps, index) => (
              <li key={index} className="chef-row">
                <span className="chef-row-main">
                  <span className="chef-row-title block">
                    {index === 0 ? "Level 1 · Direct referrals" : `Level ${index + 1}`}
                  </span>
                </span>
                <span className="chef-row-value">{bps / 100}%</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[0.875rem] leading-6 text-[#6B6B6B]">
            Each credit is held for 24 hours before it counts. Joining alone does not earn a reward.
          </p>
          <h3 className="mb-2 mt-5 text-[0.9375rem] font-semibold text-[#1A1A1A]">Referral terms</h3>
          <TermsList />
        </div>
      </Sheet>
      {feedback}
    </div>
  );
}
