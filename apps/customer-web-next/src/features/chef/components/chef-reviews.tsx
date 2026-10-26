"use client";

import { useCallback, useEffect, useState } from "react";
import { ChefEmpty, ChefNotice, ChefPageHead, ChefSection, sentenceCase, timeAgo } from "@/features/chef/components/chef-ui";
import { ChefLoading } from "@/features/chef/components/chef-loading";
import { ChefReviewsError, fetchChefReviews, fetchChefReviewSummary } from "@/features/chef/api/chef-reviews";
import type { ChefReview, ChefReviewSummary } from "@/features/chef/lib/chef-review-contract";
import { pageText } from "@/features/chef/lib/chef-page-text";
import { FEATURE_NOT_AVAILABLE } from "@/shared/lib/feature-availability";
import { format, messages } from "@/shared/i18n/language";
import { useLanguage, useText } from "@/shared/i18n/language-context";
import { AlertTriangle } from "lucide-react";

const TEXT = messages({
  en: {
    title: "Reviews", loading: "Loading reviews", stars: "{count} out of 5 stars", reviewOne: "1 review", reviewMany: "{count} reviews",
    soonTitle: "Reviews are on their way", soonText: "What customers write about your food will show up here soon.",
    failedTitle: "Reviews couldn’t load", failedText: "Check your internet and try again.", tryAgain: "Try again",
    emptyTitle: "No reviews yet", emptyText: "When customers rate your food, their reviews show up here.",
    filters: "Show reviews", all: "All", five: "5★", four: "4★", low: "3★ and below", starRow: "{stars} stars: {count}",
    noneTitle: "No reviews in this group", noneText: "Try another star rating.",
    noneLoadedTitle: "No loaded reviews in this group", noneLoadedText: "Load more to look at older reviews.", loadMore: "Load more",
    showMore: "Show more reviews", moreLoading: "Loading…", moreFailed: "Older reviews couldn’t load. Try again.",
  },
  te: {
    title: "రివ్యూలు", loading: "రివ్యూలు లోడ్ అవుతున్నాయి", stars: "5 లో {count} స్టార్లు", reviewOne: "1 రివ్యూ", reviewMany: "{count} రివ్యూలు",
    soonTitle: "రివ్యూలు త్వరలో వస్తాయి", soonText: "మీ వంట గురించి కస్టమర్లు రాసింది త్వరలో ఇక్కడ కనిపిస్తుంది.",
    failedTitle: "రివ్యూలు లోడ్ కాలేదు", failedText: "ఇంటర్నెట్ చూసుకుని మళ్లీ ప్రయత్నించండి.", tryAgain: "మళ్లీ ప్రయత్నించండి",
    emptyTitle: "ఇంకా రివ్యూలు లేవు", emptyText: "కస్టమర్లు మీ వంటకు రేటింగ్ ఇస్తే, వారి రివ్యూలు ఇక్కడ కనిపిస్తాయి.",
    filters: "రివ్యూలు చూపించండి", all: "అన్నీ", five: "5★", four: "4★", low: "3★ లేదా తక్కువ", starRow: "{stars} స్టార్లు: {count}",
    noneTitle: "ఈ రకంలో రివ్యూలు లేవు", noneText: "వేరే స్టార్ రేటింగ్ ఎంచుకోండి.",
    noneLoadedTitle: "లోడ్ అయిన వాటిలో ఈ రకం రివ్యూలు లేవు", noneLoadedText: "పాత రివ్యూలు చూడటానికి ఇంకా లోడ్ చేయండి.", loadMore: "ఇంకా లోడ్ చేయండి",
    showMore: "ఇంకా రివ్యూలు చూపించండి", moreLoading: "లోడ్ అవుతోంది…", moreFailed: "పాత రివ్యూలు లోడ్ కాలేదు. మళ్లీ ప్రయత్నించండి.",
  },
  kn: {
    title: "ರಿವ್ಯೂಗಳು", loading: "ರಿವ್ಯೂಗಳು ಲೋಡ್ ಆಗುತ್ತಿವೆ", stars: "5 ರಲ್ಲಿ {count} ಸ್ಟಾರ್", reviewOne: "1 ರಿವ್ಯೂ", reviewMany: "{count} ರಿವ್ಯೂಗಳು",
    soonTitle: "ರಿವ್ಯೂಗಳು ಶೀಘ್ರದಲ್ಲೇ ಬರಲಿವೆ", soonText: "ನಿಮ್ಮ ಅಡುಗೆಯ ಬಗ್ಗೆ ಗ್ರಾಹಕರು ಬರೆದದ್ದು ಶೀಘ್ರದಲ್ಲೇ ಇಲ್ಲಿ ಕಾಣುತ್ತದೆ.",
    failedTitle: "ರಿವ್ಯೂಗಳು ಲೋಡ್ ಆಗಲಿಲ್ಲ", failedText: "ಇಂಟರ್ನೆಟ್ ಪರಿಶೀಲಿಸಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.", tryAgain: "ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ",
    emptyTitle: "ಇನ್ನೂ ರಿವ್ಯೂಗಳಿಲ್ಲ", emptyText: "ಗ್ರಾಹಕರು ನಿಮ್ಮ ಅಡುಗೆಗೆ ರೇಟಿಂಗ್ ನೀಡಿದಾಗ, ಅವರ ರಿವ್ಯೂಗಳು ಇಲ್ಲಿ ಕಾಣುತ್ತವೆ.",
    filters: "ರಿವ್ಯೂಗಳನ್ನು ತೋರಿಸಿ", all: "ಎಲ್ಲಾ", five: "5★", four: "4★", low: "3★ ಅಥವಾ ಕಡಿಮೆ", starRow: "{stars} ಸ್ಟಾರ್: {count}",
    noneTitle: "ಈ ಗುಂಪಿನಲ್ಲಿ ರಿವ್ಯೂಗಳಿಲ್ಲ", noneText: "ಬೇರೆ ಸ್ಟಾರ್ ರೇಟಿಂಗ್ ಆಯ್ಕೆಮಾಡಿ.",
    noneLoadedTitle: "ಲೋಡ್ ಆದವುಗಳಲ್ಲಿ ಈ ಗುಂಪಿನ ರಿವ್ಯೂಗಳಿಲ್ಲ", noneLoadedText: "ಹಳೆಯ ರಿವ್ಯೂಗಳನ್ನು ನೋಡಲು ಇನ್ನಷ್ಟು ಲೋಡ್ ಮಾಡಿ.", loadMore: "ಇನ್ನಷ್ಟು ಲೋಡ್ ಮಾಡಿ",
    showMore: "ಇನ್ನಷ್ಟು ರಿವ್ಯೂಗಳನ್ನು ತೋರಿಸಿ", moreLoading: "ಲೋಡ್ ಆಗುತ್ತಿದೆ…", moreFailed: "ಹಳೆಯ ರಿವ್ಯೂಗಳು ಲೋಡ್ ಆಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
  },
});

const PAGE = 20;
type StarFilter = "all" | "five" | "four" | "low";
const FILTERS: readonly StarFilter[] = ["all", "five", "four", "low"];
const matches = (review: ChefReview, filter: StarFilter) =>
  filter === "all" || (filter === "low" ? review.overallRating <= 3 : review.overallRating === (filter === "five" ? 5 : 4));

/** "★★★★☆", read out as "4 out of 5 stars". Amber dark enough to read on white. */
export function ChefStars({ rating, className = "" }: { rating: number; className?: string }) {
  const label = useText(TEXT).stars;
  const full = Math.max(0, Math.min(5, Math.round(rating)));
  return (
    <span role="img" aria-label={format(label, { count: full })} className={`whitespace-nowrap tracking-[0.1em] text-[#B45309] ${className}`}>
      {"★".repeat(full)}
      <span className="text-[#8A8F98]">{"★".repeat(5 - full)}</span>
    </span>
  );
}

type Load =
  | { state: "loading" | "soon" | "failed" }
  | { state: "ready"; reviews: ChefReview[]; cursor: string | null; hasMore: boolean };

/** Reviews: the kitchen's rating at a glance, then what customers wrote (app ChefReviewsScreen). */
export function ChefReviews() {
  const text = useText(TEXT);
  const { language } = useLanguage();
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [summary, setSummary] = useState<ChefReviewSummary | null>(null);
  const [filter, setFilter] = useState<StarFilter>("all");
  const [more, setMore] = useState<"" | "loading" | "failed">("");

  const read = useCallback(async () => {
    setLoad({ state: "loading" });
    setSummary(null);
    try {
      const page = await fetchChefReviews({ limit: PAGE });
      setLoad({ state: "ready", reviews: page.items, cursor: page.nextCursor, hasMore: page.hasMore });
      // The server's average covers every review; a kitchen's reviews all share its id.
      const kitchenId = page.items[0]?.kitchenId;
      if (kitchenId) void fetchChefReviewSummary(kitchenId).then(setSummary, () => setSummary(null));
    } catch (caught) {
      setLoad({ state: caught instanceof ChefReviewsError && caught.code === FEATURE_NOT_AVAILABLE ? "soon" : "failed" });
    }
  }, []);

  useEffect(() => {
    void read();
  }, [read]);

  async function loadMore() {
    if (load.state !== "ready" || !load.cursor || more === "loading") return;
    setMore("loading");
    try {
      const page = await fetchChefReviews({ limit: PAGE, cursor: load.cursor });
      setLoad({ state: "ready", reviews: [...load.reviews, ...page.items], cursor: page.nextCursor, hasMore: page.hasMore });
      setMore("");
    } catch {
      // The reviews already shown stay; the button is there to try again.
      setMore("failed");
    }
  }

  const head = <ChefPageHead title={text.title} back={{ href: "/chef/profile", label: pageText("More", language) }} />;
  if (load.state === "loading") return <div>{head}<ChefLoading shape="notifications" head={false} label={text.loading} /></div>;
  if (load.state !== "ready" || load.reviews.length === 0) {
    const empty =
      load.state === "soon" ? { illustration: "comingSoon" as const, title: text.soonTitle, text: text.soonText }
        : load.state === "failed" ? { illustration: "loadError" as const, title: text.failedTitle, text: text.failedText }
          : { illustration: "reviews" as const, title: text.emptyTitle, text: text.emptyText };
    return (
      <div>
        {head}
        <ChefSection>
          <ChefEmpty
            {...empty}
            action={load.state === "failed" ? <button type="button" onClick={() => void read()} className="chef-btn is-primary">{text.tryAgain}</button> : undefined}
          />
        </ChefSection>
      </div>
    );
  }

  const { reviews, hasMore } = load;
  // The server's average wins; without it the number shows only once every review is here, so it never misleads.
  const average = summary?.overallAverage ?? (hasMore ? null : reviews.reduce((sum, review) => sum + review.overallRating, 0) / reviews.length);
  const count = summary?.reviewCount ?? reviews.length;
  const shown = reviews.filter((review) => matches(review, filter));
  const moreButton = (label: string) => (
    <button type="button" onClick={() => void loadMore()} disabled={more === "loading"} aria-busy={more === "loading" || undefined} className="chef-btn">
      {more === "loading" ? text.moreLoading : label}
    </button>
  );

  return (
    <div>
      {head}
      <div className="chef-stack">
        <ChefSection>
          <div className="flex items-center gap-5">
            <div className="grid shrink-0 justify-items-center gap-1 text-center">
              <p className="font-display text-[2.5rem] font-bold leading-none tracking-[-0.03em] text-[#1A1A1A]">{average === null ? "—" : average.toFixed(1)}</p>
              {average === null ? null : <ChefStars rating={average} className="text-lg" />}
              <p className="text-[0.8125rem] font-semibold text-[#6B6B6B]">{count === 1 ? text.reviewOne : format(text.reviewMany, { count })}</p>
            </div>
            {/* Star by star; drawn only once every review is loaded, so the bars never show a part. */}
            {hasMore ? null : (
              <ul className="grid min-w-0 flex-1 gap-1.5">
                {[5, 4, 3, 2, 1].map((stars) => {
                  const withStars = reviews.filter((review) => review.overallRating === stars).length;
                  return (
                    <li key={stars} className="flex items-center gap-2 text-[0.8125rem] font-semibold text-[#6B6B6B]">
                      <span className="sr-only">{format(text.starRow, { stars, count: withStars })}</span>
                      <span aria-hidden="true" className="w-3 text-right">{stars}</span>
                      <span aria-hidden="true" className="h-2 flex-1 overflow-hidden rounded-full bg-[#E3E6EA]">
                        <span className="block h-full rounded-full bg-[#B45309]" style={{ width: `${(withStars / reviews.length) * 100}%` }} />
                      </span>
                      <span aria-hidden="true" className="w-6 tabular-nums">{withStars}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </ChefSection>

        <div role="group" aria-label={text.filters} className="chef-chips">
          {FILTERS.map((option) => (
            <button key={option} type="button" className="chef-chip is-filter" aria-pressed={filter === option} onClick={() => setFilter(option)}>
              {text[option]}
            </button>
          ))}
        </div>

        {shown.length === 0 ? (
          <ChefSection>
            <ChefEmpty
              illustration="search"
              title={hasMore ? text.noneLoadedTitle : text.noneTitle}
              text={hasMore ? text.noneLoadedText : text.noneText}
              action={hasMore ? moreButton(text.loadMore) : undefined}
            />
          </ChefSection>
        ) : (
          <ul className="chef-stack">
            {shown.map((review) => (
              <li key={review.reviewId} className="chef-section chef-section-body">
                <div className="flex items-center justify-between gap-3">
                  <ChefStars rating={review.overallRating} className="text-lg" />
                  <span className="text-[0.8125rem] text-[#6B6B6B]">{timeAgo(review.publishedAt, undefined, language)}</span>
                </div>
                {review.reviewText ? <p className="mt-2 whitespace-pre-line break-words text-[0.9375rem] leading-6 text-[#1A1A1A]">{review.reviewText}</p> : null}
                {review.tagCodes.length ? (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {review.tagCodes.map((code) => (
                      <li key={code} className="rounded-full bg-[#F1F3F5] px-3 py-1 text-[0.8125rem] font-semibold text-[#1A1A1A]">{sentenceCase(code)}</li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <div aria-live="polite" className="grid justify-items-center gap-2 empty:hidden">
          {more === "failed" ? <ChefNotice icon={AlertTriangle} tone="danger">{text.moreFailed}</ChefNotice> : null}
          {hasMore && shown.length > 0 ? moreButton(text.showMore) : null}
        </div>
      </div>
    </div>
  );
}

export default ChefReviews;
