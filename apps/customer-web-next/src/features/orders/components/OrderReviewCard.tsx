"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { Star } from "lucide-react";
import {
  getOrderReview,
  listReviewTags,
  OrderReviewError,
  saveOrderReview,
} from "@/features/orders/api/order-review";
import {
  REVIEW_STATUS_LABELS,
  REVIEW_TAGS_MAX,
  REVIEW_TEXT_MAX,
  type CustomerReview,
  type ReviewTag,
} from "@/features/orders/lib/review-contract";
import { FEATURE_NOT_AVAILABLE } from "@/shared/lib/feature-availability";
import { ComingSoon } from "@/shared/ui/feedback/ComingSoon";
import { Sheet, secondaryActionClass } from "@/shared/ui/overlays/overlay";

const CARD = "rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_3px_10px_rgba(26,26,26,0.04)]";
const RATINGS = [1, 2, 3, 4, 5] as const;
const MODERATED = "Your review is pending moderation before it can appear publicly.";

type Loaded =
  | { kind: "loading" }
  | { kind: "ready"; review: CustomerReview | null }
  | { kind: "unavailable" }
  | { kind: "error" };

function Stars({ value, className }: { value: number; className: string }) {
  return RATINGS.map((star) => (
    <Star
      key={star}
      aria-hidden="true"
      className={`${className} ${star <= value ? "fill-[#F62E18] text-[#F62E18]" : "text-[#D7DADF]"}`}
    />
  ));
}

function saveProblem(error: unknown): { message: string; refresh?: boolean } {
  const code = error instanceof OrderReviewError ? error.code : "";
  switch (code) {
    case "ORDER_REVIEW_VERSION_CONFLICT":
    case "ORDER_REVIEW_ALREADY_EXISTS":
      return {
        message: "Review changed. Refresh the review before saving your changes.",
        refresh: true,
      };
    case "REVIEW_TAG_NOT_AVAILABLE":
      return {
        message: "One of the tags you picked is no longer offered. Remove it and try again.",
      };
    case "ORDER_NOT_REVIEWABLE":
      return { message: "You can rate this order once it has been delivered." };
    case "SESSION_EXPIRED":
      return { message: "Your session has ended. Sign in again to save your review." };
    case FEATURE_NOT_AVAILABLE:
      return { message: "Rating orders is coming soon." };
    default:
      return { message: "Your review wasn’t saved. Please try again." };
  }
}

/** "Rate this order" on a delivered order, then the saved rating with an Edit action, like the app. */
export function OrderReviewCard({ orderId }: { orderId: string }) {
  const [loaded, setLoaded] = useState<Loaded>({ kind: "loading" });
  const [tags, setTags] = useState<ReviewTag[]>([]);
  const [editing, setEditing] = useState(false);
  // A fresh form each time it opens, kept mounted while it animates closed.
  const [formKey, setFormKey] = useState(0);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoaded({ kind: "loading" });
    try {
      setLoaded({ kind: "ready", review: await getOrderReview(orderId) });
    } catch (error) {
      const unavailable = error instanceof OrderReviewError && error.code === FEATURE_NOT_AVAILABLE;
      setLoaded({ kind: unavailable ? "unavailable" : "error" });
    }
  }, [orderId]);

  useEffect(() => {
    void load();
    void listReviewTags().then(setTags);
  }, [load]);

  if (loaded.kind === "unavailable") {
    return (
      <ComingSoon title="Rate this order" message="Rating orders on the web is coming soon." />
    );
  }

  const review = loaded.kind === "ready" ? loaded.review : null;
  const hasMedia = Boolean(review?.mediaAssetIds.length);
  const tagLabels = (review?.tagCodes ?? []).flatMap(
    (code) => tags.find((tag) => tag.code === code)?.displayLabel ?? [],
  );
  const openForm = () => {
    setNotice("");
    setFormKey((key) => key + 1);
    setEditing(true);
  };

  return (
    <section
      className={`${CARD} p-5 md:p-6`}
      aria-labelledby="order-review-title"
      aria-busy={loaded.kind === "loading"}
    >
      {review ? (
        <>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="order-review-title" className="text-base font-semibold">
                Your rating
              </h2>
              <p className="mt-0.5 text-xs text-[#6B6B6B]">{REVIEW_STATUS_LABELS[review.status]}</p>
            </div>
            <button
              type="button"
              onClick={openForm}
              disabled={hasMedia}
              aria-label="Edit your rating"
              className="inline-flex min-h-10 shrink-0 items-center rounded-full bg-[#F1F3F5] px-4 text-sm font-bold text-[#1A1A1A] hover:bg-[#E6E9EC] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Edit
            </button>
          </div>
          <p
            className="mt-3 flex gap-0.5"
            role="img"
            aria-label={`${review.overallRating} out of 5 stars`}
          >
            <Stars value={review.overallRating} className="h-5 w-5" />
          </p>
          {review.reviewText ? (
            <p className="mt-2 whitespace-pre-line break-words text-[0.9375rem] leading-6 text-[#4A4A4A]">
              {review.reviewText}
            </p>
          ) : null}
          {tagLabels.length ? (
            <ul className="mt-3 flex flex-wrap gap-2" aria-label="What stood out">
              {tagLabels.map((label) => (
                <li
                  key={label}
                  className="rounded-full bg-[#F1F3F5] px-3 py-1 text-xs font-semibold text-[#1A1A1A]"
                >
                  {label}
                </li>
              ))}
            </ul>
          ) : null}
          {hasMedia ? (
            <p className="mt-3 text-xs text-[#6B6B6B]">
              This review includes photos, so it can’t be edited here.
            </p>
          ) : null}
        </>
      ) : (
        <>
          <h2 id="order-review-title" className="text-base font-semibold">
            How was your order?
          </h2>
          {loaded.kind === "error" ? (
            <>
              <p role="alert" className="mt-1 text-sm leading-6 text-[#6B6B6B]">
                Your rating didn’t load. Check your connection and try again.
              </p>
              <button
                type="button"
                onClick={() => void load()}
                className={`${secondaryActionClass} mt-4`}
              >
                Try again
              </button>
            </>
          ) : (
            <>
              <p className="mt-1 text-sm leading-6 text-[#6B6B6B]">
                Share a rating and optional feedback about this delivered order.
              </p>
              <button
                type="button"
                onClick={openForm}
                disabled={loaded.kind === "loading"}
                className="craves-primary-action mt-4 w-full sm:w-auto"
              >
                Rate this order
              </button>
            </>
          )}
        </>
      )}
      <p role="status" className="mt-3 text-sm font-medium text-[#1A1A1A] empty:hidden">
        {notice}
      </p>
      <ReviewForm
        key={formKey}
        open={editing}
        orderId={orderId}
        review={review}
        tags={tags}
        onClose={() => setEditing(false)}
        onRefresh={() => {
          setEditing(false);
          void load();
        }}
        onSaved={(saved) => {
          setNotice(`${review ? "Review updated." : "Review submitted."} ${MODERATED}`);
          setLoaded({ kind: "ready", review: saved });
          setEditing(false);
        }}
      />
    </section>
  );
}

function ReviewForm({
  open,
  orderId,
  review,
  tags,
  onClose,
  onRefresh,
  onSaved,
}: {
  open: boolean;
  orderId: string;
  review: CustomerReview | null;
  tags: ReviewTag[];
  onClose: () => void;
  onRefresh: () => void;
  onSaved: (review: CustomerReview) => void;
}) {
  const id = useId();
  const [rating, setRating] = useState(review?.overallRating ?? 0);
  const [text, setText] = useState(review?.reviewText ?? "");
  // Saved tags stay picked even when the tag list didn't load, so an edit never drops them.
  const [picked, setPicked] = useState<string[]>(review?.tagCodes ?? []);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{ message: string; refresh?: boolean } | null>(null);
  const changed =
    rating !== (review?.overallRating ?? 0) ||
    text !== (review?.reviewText ?? "") ||
    picked.join() !== (review?.tagCodes ?? []).join();

  async function save() {
    if (!rating || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      onSaved(
        await saveOrderReview(
          orderId,
          { overallRating: rating, reviewText: text, tagCodes: picked },
          review,
        ),
      );
    } catch (error) {
      setProblem(saveProblem(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      busy={busy}
      closeOnOutsideTap={!changed}
      unsavedChanges={changed}
      title={review ? "Edit your rating" : "Rate your order"}
      description="Your review is moderated before public display. Customer identity and delivery details are not part of the public review."
      closeLabel="Close rating"
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className={secondaryActionClass}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy || !rating}
            aria-busy={busy}
            className="craves-primary-action w-full sm:w-auto"
          >
            {busy ? "Saving…" : review ? "Update review" : "Submit review"}
          </button>
        </>
      }
    >
      <fieldset className="mt-5">
        <legend className="text-base font-semibold">Overall rating</legend>
        <p className="text-sm text-[#6B6B6B]">Choose one rating from 1 to 5.</p>
        <div className="mt-2 flex gap-1">
          {RATINGS.map((value) => (
            <label
              key={value}
              className="cursor-pointer rounded-lg p-1 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[#1A1A1A]"
            >
              <input
                type="radio"
                name={`${id}-rating`}
                value={value}
                checked={rating === value}
                onChange={() => setRating(value)}
                className="sr-only"
              />
              <Star
                aria-hidden="true"
                className={`h-9 w-9 ${value <= rating ? "fill-[#F62E18] text-[#F62E18]" : "text-[#D7DADF]"}`}
              />
              <span className="sr-only">{value} out of 5</span>
            </label>
          ))}
        </div>
      </fieldset>

      {tags.length ? (
        <fieldset className="mt-5">
          <legend className="text-base font-semibold">What stood out?</legend>
          <p className="text-sm text-[#6B6B6B]">Optional. Pick up to {REVIEW_TAGS_MAX}.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {tags.map((tag) => {
              const on = picked.includes(tag.code);
              return (
                <button
                  key={tag.code}
                  type="button"
                  aria-pressed={on}
                  disabled={!on && picked.length >= REVIEW_TAGS_MAX}
                  onClick={() =>
                    setPicked((codes) =>
                      on ? codes.filter((code) => code !== tag.code) : [...codes, tag.code],
                    )
                  }
                  className={`inline-flex min-h-10 items-center rounded-full !border px-3.5 text-[0.8125rem] font-bold !shadow-none disabled:opacity-50 ${
                    on
                      ? "!border-[#1A1A1A] !bg-[#F1F3F5] !text-[#1A1A1A]"
                      : "!border-[#E5E7EB] !bg-white !text-[#1A1A1A] hover:!bg-[#F1F3F5]"
                  }`}
                >
                  {tag.displayLabel}
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      <div className="mt-5">
        <label htmlFor={`${id}-text`} className="text-base font-semibold">
          Write a review
        </label>
        <textarea
          id={`${id}-text`}
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={REVIEW_TEXT_MAX}
          rows={4}
          placeholder="Share your experience (optional)"
          aria-describedby={`${id}-count`}
          className="mt-2 w-full resize-y rounded-xl border border-[#E5E7EB] bg-white p-3 text-[0.9375rem] leading-6 text-[#1A1A1A] placeholder:text-[#8B8F93] focus-visible:border-[#1A1A1A] focus-visible:outline-none"
        />
        <p id={`${id}-count`} className="mt-1 text-right text-xs tabular-nums text-[#6B6B6B]">
          {text.length}/{REVIEW_TEXT_MAX}
        </p>
      </div>

      {problem ? (
        <div
          role="alert"
          className="mt-4 rounded-xl bg-[#F1F3F5] p-3 text-sm font-medium text-[#C4200F]"
        >
          {problem.message}
          {problem.refresh ? (
            <button
              type="button"
              onClick={onRefresh}
              className="ml-2 font-bold text-[#1A1A1A] underline"
            >
              Refresh
            </button>
          ) : null}
        </div>
      ) : null}
    </Sheet>
  );
}
