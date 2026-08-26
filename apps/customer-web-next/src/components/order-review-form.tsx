"use client";

import { useEffect, useState } from "react";
import type { OrderReview } from "@/lib/order-review-contract";

export function OrderReviewForm({ orderId }: { orderId: string }) {
  const [existingReview, setExistingReview] = useState<OrderReview | null>(null);
  const [rating, setRating] = useState(5);
  const [reviewTitle, setReviewTitle] = useState("");
  const [reviewBody, setReviewBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    fetch(`/api/orders/${encodeURIComponent(orderId)}/review`, { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 404) {
          return null;
        }
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(body.message ?? body.code ?? "Unable to load review");
        }
        return body as OrderReview;
      })
      .then((review) => {
        if (ignore) return;
        setExistingReview(review);
        if (review) {
          setRating(review.rating);
          setReviewTitle(review.reviewTitle ?? "");
          setReviewBody(review.reviewBody ?? "");
        }
      })
      .catch((loadError) => {
        if (!ignore) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load review");
        }
      })
      .finally(() => {
        if (!ignore) {
          setLoading(false);
        }
      });
    return () => {
      ignore = true;
    };
  }, [orderId]);

  async function submitReview() {
    setSaving(true);
    setError("");
    setMessage("");
    const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating, reviewTitle, reviewBody }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setSaving(false);
      setError(body.message ?? body.code ?? "Unable to submit review");
      return;
    }
    const review = body as OrderReview;
    setExistingReview(review);
    setMessage("Thanks for sharing your experience.");
    setSaving(false);
  }

  if (loading) {
    return <section className="rounded-[28px] bg-[#FFF8EC] p-6 text-sm text-slate-600">Loading your review options…</section>;
  }

  return (
    <section className="rounded-[28px] bg-[#FFF8EC] p-6 text-slate-950 shadow-xl shadow-black/10">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#6930CA]">Post-order feedback</p>
          <h2 className="mt-2 text-2xl font-bold">Rate this order</h2>
        </div>
        {existingReview ? <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">Review submitted</span> : null}
      </div>
      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
      {message ? <p className="mt-4 text-sm text-emerald-700">{message}</p> : null}
      <div className="mt-5 flex gap-2">
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            disabled={!!existingReview}
            onClick={() => setRating(value)}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${rating === value ? "bg-[#6930CA] text-white" : "bg-white text-slate-700"}`}
          >
            {value}★
          </button>
        ))}
      </div>
      <div className="mt-5 grid gap-4">
        <label className="grid gap-2 text-sm">
          <span className="font-medium">Headline</span>
          <input
            value={reviewTitle}
            onChange={(event) => setReviewTitle(event.target.value.slice(0, 120))}
            disabled={!!existingReview}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none"
            placeholder="What stood out?"
          />
        </label>
        <label className="grid gap-2 text-sm">
          <span className="font-medium">Your review</span>
          <textarea
            value={reviewBody}
            onChange={(event) => setReviewBody(event.target.value.slice(0, 1000))}
            disabled={!!existingReview}
            className="min-h-32 rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none"
            placeholder="Tell us about food quality, packaging, and delivery experience."
          />
        </label>
      </div>
      {!existingReview ? (
        <button
          type="button"
          disabled={saving}
          onClick={submitReview}
          className="mt-6 rounded-full bg-[#6930CA] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {saving ? "Submitting…" : "Submit review"}
        </button>
      ) : null}
    </section>
  );
}
