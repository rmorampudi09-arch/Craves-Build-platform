import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_DISCOVERY_RADIUS_METERS } from "@/features/home/lib/catalog-discovery-policy";
import { hasHomeReturnState } from "@/features/home/lib/home-return-state";
import { useReturnScroll } from "@/shared/lib/return-scroll";
import type { KitchenReviewSummary } from "@/features/dish/lib/review-summary-contract";
import {
  getChef,
  getDishesByChef,
  type Chef,
} from "@/features/chefs/api/chefs";
import { loadKitchenMenu } from "@/features/dish/api/dishes";
import { discoverKitchens } from "@/features/chefs/api/kitchens";
import { loadKitchenReviewSummary } from "@/features/dish/api/reviews";
import {
  loadSelectedAddress,
  loadSession,
} from "@/features/auth/api/cravesAuth";
import { DetailBrowseHeader } from "@/features/customer-shell/components/DetailBrowseHeader";
import { KitchenHeader } from "@/features/chefs/components/KitchenHeader";
import { KitchenMenu } from "@/features/chefs/components/KitchenMenu";
import { kitchenFoodMixLabel, kitchenJoinedLabel, kitchenLocation } from "@/features/chefs/lib/kitchen-menu";
import { useKitchenProfile } from "@/shared/hooks/use-kitchen-profile";
import { formatPreparationTime } from "@/shared/lib/kitchen-dish-summary";
import { ChefFace } from "@/shared/ui/data-display/ChefFace";
import { CustomerPageSkeleton } from "@/shared/components/loading/CustomerPageSkeleton";
import { CustomerReviewsSection } from "@/features/dish/components/CustomerReviewsSection";
import {
  CustomerFloatingCart,
  useCustomerCartSummary,
} from "@/features/cart/components/CustomerFloatingCart";

export const routeMeta = {
  head: ({ params }: { params: { id: string } }) => {
    const chef = getChef(params.id);
    return {
      meta: [
        { title: chef ? `${chef.name} – Craves` : "Home Kitchen – Craves" },
        {
          name: "description",
          content: chef
            ? `${chef.name} · Active home kitchen on Craves.`
            : "Live home kitchen on Craves.",
        },
        { name: "robots", content: "noindex" },
      ],
    };
  },
};

const routeApi = getRouteApi("/kitchen/$id");

function ChefProfilePage() {
  const { id } = routeApi.useParams();
  const navigate = useNavigate();
  const [chef, setChef] = useState<Chef | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [reviewSummary, setReviewSummary] = useState<KitchenReviewSummary | null>(null);
  const cartSummary = useCustomerCartSummary();
  const rememberScroll = useReturnScroll(!loading);
  const { profile } = useKitchenProfile(id);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [pastTitle, setPastTitle] = useState(false);
  const [bioExpanded, setBioExpanded] = useState(false);
  // A stable list, so the menu's grouping and scroll tracking are not redone on every render.
  const dishes = useMemo(() => (chef ? getDishesByChef(chef.name) : []), [chef]);

  // The kitchen bar (h-16) turns white and shows the kitchen once its name has scrolled under the bar.
  useEffect(() => {
    const title = titleRef.current;
    if (!title || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setPastTitle(Boolean(entry && !entry.isIntersecting && entry.boundingClientRect.top < 64)),
      { rootMargin: "-64px 0px 0px 0px" },
    );
    observer.observe(title);
    return () => observer.disconnect();
  }, [chef]);

  useEffect(() => {
    let active = true;
    setChef(undefined);
    setLoading(true);
    setMessage("");
    setReviewSummary(null);

    void (async () => {
      const session = await loadSession();
      if (!session) {
        navigate({ to: "/" });
        return;
      }

      const address = await loadSelectedAddress();
      if (
        typeof address?.lat !== "number" ||
        typeof address.lng !== "number"
      ) {
        throw new Error(
          "Choose a delivery address before opening this home kitchen.",
        );
      }

      const discovery = await discoverKitchens(
        address.lat,
        address.lng,
        DEFAULT_DISCOVERY_RADIUS_METERS,
      );
      const nearbyKitchen = discovery.kitchens.find(
        (kitchen) => kitchen.id === id,
      );
      if (!nearbyKitchen) {
        throw new Error(
          "This home kitchen is outside the 10 km Craves browsing area for your selected address.",
        );
      }

      await loadKitchenMenu(id);
      const resolved = getChef(id);
      if (!resolved) {
        throw new Error(
          "This home kitchen has no active dishes available right now.",
        );
      }

      if (!active) return;
      setChef(resolved);
      setLoading(false);

      void loadKitchenReviewSummary(resolved.id)
        .then((summary) => {
          if (active) setReviewSummary(summary);
        })
        .catch(() => {
          if (active) setReviewSummary(null);
        });
    })().catch((error) => {
      if (!active) return;
      setChef(undefined);
      setMessage(
        error instanceof Error
          ? error.message
          : "Kitchen details could not be loaded.",
      );
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [id, navigate]);

  const handleBack = () => {
    if (
      typeof window !== "undefined" &&
      hasHomeReturnState() &&
      window.history.length > 1
    ) {
      window.history.back();
      return;
    }

    navigate({ to: "/home" });
  };

  if (loading) {
    return <CustomerPageSkeleton variant="kitchen" label="Loading this home kitchen" />;
  }

  if (!chef) {
    return (
      <div className="min-h-screen bg-white">
        <DetailBrowseHeader returnPath={`/kitchen/${id}`} onBack={handleBack} />
        <main className="flex min-h-[70vh] items-center justify-center px-4 text-center">
          <div className="max-w-md rounded-[1.75rem] border border-[#E5E7EB] bg-white p-8">
            <h1 className="font-display text-2xl font-black text-[#1A1A1A]">
              Home kitchen not found
            </h1>
            <p className="mt-3 text-sm leading-6 text-[#6B6B6B]">
              {message || "This kitchen is not currently available in the live Craves catalog."}
            </p>
            <button
              type="button"
              onClick={handleBack}
              className="!mt-6 !inline-flex !min-h-11 !items-center !rounded-full !bg-[#F62E18] !px-5 !text-sm !font-black !text-white"
            >
              Back to home
            </button>
          </div>
        </main>
      </div>
    );
  }

  const name = chef.name;
  const location = profile ? kitchenLocation([profile.areaName, profile.city, profile.state]) : chef.location;
  const subtitle = [
    profile?.displayName && profile.displayName !== profile.kitchenName ? profile.kitchenName : null,
    location,
    kitchenJoinedLabel(profile?.createdAt),
  ].filter(Boolean).join(" · ");
  const facts = [
    `${chef.activeDishCount} ${chef.activeDishCount === 1 ? "dish" : "dishes"}`,
    kitchenFoodMixLabel(dishes),
    formatPreparationTime(dishes),
    reviewSummary && reviewSummary.reviewCount > 0 && reviewSummary.overallAverage !== null
      ? `${reviewSummary.overallAverage.toFixed(1)} ★ · ${reviewSummary.reviewCount} ${reviewSummary.reviewCount === 1 ? "review" : "reviews"}`
      : null,
  ].filter((fact): fact is string => Boolean(fact));
  const bio = profile?.description ?? chef.bio;

  return (
    <div
      className={`min-h-screen bg-white text-[#1A1A1A] ${cartSummary.itemCount > 0 ? "pb-32" : "pb-14"}`}
      onClickCapture={rememberScroll}
    >
      <KitchenHeader
        kitchenId={chef.id}
        name={name}
        chefPhotoUrl={profile?.chefPhotoUrl}
        photos={profile?.kitchenPhotoUrls ?? []}
        solid={pastTitle}
        onBack={handleBack}
      />

      <main className="mx-auto max-w-6xl px-4 md:px-6">
        <section className="relative z-10">
          <ChefFace
            photoUrl={profile?.chefPhotoUrl}
            name={name}
            size={92}
            className="-mt-[46px] flex shadow-[0_8px_24px_rgba(26,26,26,0.14)] ring-4 ring-white"
          />
          <h1 ref={titleRef} className="mt-2 font-display text-3xl font-black tracking-[-0.045em] text-[#1A1A1A] md:text-4xl">
            {name}
          </h1>
          {subtitle ? <p className="mt-1 text-sm font-semibold text-[#6B6B6B]">{subtitle}</p> : null}
          <ul className="mt-3 flex flex-wrap gap-2" aria-label="About this kitchen">
            {facts.map((fact) => (
              <li key={fact} className="rounded-full bg-[#F1F3F5] px-3 py-1.5 text-xs font-bold text-[#1A1A1A]">{fact}</li>
            ))}
          </ul>
          {bio ? (
            <>
              <p id="kitchen-bio" className={`mt-3 max-w-3xl text-sm leading-6 text-[#1A1A1A] sm:text-[0.95rem] ${bioExpanded ? "" : "line-clamp-3"}`}>{bio}</p>
              {bio.length > 180 ? (
                <button
                  type="button"
                  onClick={() => setBioExpanded((value) => !value)}
                  aria-expanded={bioExpanded}
                  aria-controls="kitchen-bio"
                  className="mt-1 !min-h-10 !min-w-0 !border-0 !bg-transparent !p-0 text-sm font-black text-[#C4200F] !shadow-none"
                >
                  {bioExpanded ? "Show less" : "Read more"}
                </button>
              ) : null}
            </>
          ) : null}
        </section>

        <KitchenMenu dishes={dishes} />
        {chef.reviews.length > 0 ? (
          <CustomerReviewsSection reviews={chef.reviews} />
        ) : null}
      </main>

      <CustomerFloatingCart />
    </div>
  );
}

export default ChefProfilePage;
