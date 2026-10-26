import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { MapPin, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DEFAULT_DISCOVERY_RADIUS_METERS } from "@/features/home/lib/catalog-discovery-policy";
import { hasHomeReturnState } from "@/features/home/lib/home-return-state";
import { useReturnScroll } from "@/shared/lib/return-scroll";
import { rememberReturnRoute } from "@/shared/lib/return-navigation";
import type { KitchenReviewSummary } from "@/features/dish/lib/review-summary-contract";
import { loadKitchenMenu, type Dish } from "@/features/dish/api/dishes";
import { discoverKitchens } from "@/features/chefs/api/kitchens";
import { loadCart } from "@/features/cart/api/cravesCart";
import { loadKitchenReviewSummary } from "@/features/dish/api/reviews";
import {
  loadSelectedAddress,
  loadSession,
  type CravesAddress,
} from "@/features/auth/api/cravesAuth";
import { DetailBrowseHeader } from "@/features/customer-shell/components/DetailBrowseHeader";
import { KitchenHeader } from "@/features/chefs/components/KitchenHeader";
import { KitchenMenu } from "@/features/chefs/components/KitchenMenu";
import { kitchenFoodMixLabel, kitchenJoinedLabel, kitchenLocation } from "@/features/chefs/lib/kitchen-menu";
import { useFavoriteKitchen } from "@/shared/hooks/use-favorite-kitchen";
import { getKitchenProfile } from "@/shared/lib/kitchen-profile-client";
import type { KitchenProfile } from "@/shared/lib/kitchen-profile-contract";
import { formatPreparationTime } from "@/shared/lib/kitchen-dish-summary";
import { ChefFace } from "@/shared/ui/data-display/ChefFace";
import { EmptyState, emptyStateSecondaryAction } from "@/shared/ui/feedback/EmptyState";
import { CustomerPageSkeleton } from "@/shared/components/loading/CustomerPageSkeleton";
import { CustomerReviewsSection } from "@/features/dish/components/CustomerReviewsSection";
import {
  CustomerFloatingCart,
  useCustomerCartSummary,
} from "@/features/cart/components/CustomerFloatingCart";

/** Whether the kitchen delivers to the selected address: "unknown" never turns Add off (checkout checks again). */
type Delivery = "yes" | "no" | "unknown" | "no-address";
type KitchenPage =
  | { kind: "ready"; profile: KitchenProfile; dishes: Dish[]; delivery: Delivery; address: CravesAddress | null }
  | { kind: "not-found" }
  | { kind: "error" };

const routeApi = getRouteApi("/kitchen/$id");

/** Is the kitchen among those within 10 km of the selected address (what Home and the Chefs tab list)? */
async function deliveryTo(kitchenId: string): Promise<{ delivery: Delivery; address: CravesAddress | null }> {
  const address = await loadSelectedAddress().catch(() => null);
  if (typeof address?.lat !== "number" || typeof address.lng !== "number") return { delivery: "no-address", address };
  try {
    const nearby = await discoverKitchens(address.lat, address.lng, DEFAULT_DISCOVERY_RADIUS_METERS);
    if (nearby.kitchens.some((kitchen) => kitchen.id.toLowerCase() === kitchenId.toLowerCase())) return { delivery: "yes", address };
    // shortcut: reads the 50 nearest kitchens; a kitchen past them counts as unknown (Add stays on, checkout checks); page on when a place has more than 50 in reach.
    return { delivery: nearby.hasNext ? "unknown" : "no", address };
  } catch {
    return { delivery: "unknown", address };
  }
}

/** The place in "doesn't deliver to …": the area, else the city, else the address's own label. */
function placeName(address: CravesAddress | null): string {
  return address?.mandal?.trim() || address?.city?.trim() || address?.label?.trim() || "your address";
}

/** The menu's empty state, as in the app (1.35): see other home chefs, or save this kitchen to find it again. */
function NoDishes({ kitchenId, name }: { kitchenId: string; name: string }) {
  const { saved, busy, toggle } = useFavoriteKitchen(kitchenId);
  return (
    <EmptyState
      compact
      illustration="kitchenNoDishes"
      title="No dishes right now"
      message={`${name} hasn't put up today's dishes yet. Save this kitchen to find it again, or see other home chefs.`}
    >
      <Link to="/chefs" className="craves-primary-action">
        See other home chefs
      </Link>
      {saved ? null : (
        // The shared class needs "!" on a button, where the site's base button colours otherwise win.
        <button type="button" onClick={() => void toggle()} disabled={busy} className={`${emptyStateSecondaryAction} !border-[#F62E18] !bg-white !text-[#D92714] !shadow-none hover:!bg-[#FDEAE8]`}>
          Save this kitchen
        </button>
      )}
    </EmptyState>
  );
}

function ChefProfilePage() {
  const { id } = routeApi.useParams();
  const navigate = useNavigate();
  const [page, setPage] = useState<KitchenPage | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [reviewSummary, setReviewSummary] = useState<KitchenReviewSummary | null>(null);
  const cartSummary = useCustomerCartSummary();
  const rememberScroll = useReturnScroll(page !== null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [pastTitle, setPastTitle] = useState(false);
  const [bioExpanded, setBioExpanded] = useState(false);

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
  }, [page]);

  useEffect(() => {
    let active = true;
    setPage(null);
    setReviewSummary(null);

    void (async () => {
      const session = await loadSession();
      if (!session) {
        navigate({ to: "/" });
        return;
      }

      // Opened straight from a link, the cart isn't loaded yet: the menu's steppers show what is in it.
      void loadCart().catch(() => undefined);
      // Any kitchen opens by its id, as in the app, near or not: the public profile and menu, read
      // without adding them to the nearby dishes Home lists. Delivery is checked beside them.
      const [profile, menu, delivery] = await Promise.allSettled([
        getKitchenProfile(id),
        loadKitchenMenu(id, { remember: false }),
        deliveryTo(id),
      ]);
      if (!active) return;
      if (profile.status === "fulfilled" && profile.value === null) {
        setPage({ kind: "not-found" });
        return;
      }
      if (profile.status !== "fulfilled" || !profile.value || menu.status !== "fulfilled" || delivery.status !== "fulfilled") {
        setPage({ kind: "error" });
        return;
      }
      setPage({ kind: "ready", profile: profile.value, dishes: menu.value, ...delivery.value });

      void loadKitchenReviewSummary(profile.value.id)
        .then((summary) => {
          if (active) setReviewSummary(summary);
        })
        .catch(() => {
          if (active) setReviewSummary(null);
        });
    })().catch(() => {
      if (active) setPage({ kind: "error" });
    });

    return () => {
      active = false;
    };
  }, [id, navigate, attempt]);

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

  const changeAddress = () => {
    rememberReturnRoute("/addresses", `/kitchen/${id}`);
    navigate({ to: "/addresses" });
  };

  if (!page) {
    return <CustomerPageSkeleton variant="kitchen" label="Loading this home kitchen" />;
  }

  if (page.kind !== "ready") {
    return (
      <div className="min-h-screen bg-white">
        <DetailBrowseHeader returnPath={`/kitchen/${id}`} onBack={handleBack} />
        <main className="flex min-h-[70vh] items-center justify-center">
          {page.kind === "not-found" ? (
            <EmptyState
              heading="h1"
              illustration="search"
              title="This kitchen isn't on Craves right now"
              message="It may have closed or stopped taking orders. Other home chefs are cooking near you."
            >
              <Link to="/chefs" className="craves-primary-action">
                See other home chefs
              </Link>
            </EmptyState>
          ) : (
            <EmptyState
              heading="h1"
              role="alert"
              illustration="loadError"
              title="This kitchen could not be loaded"
              message="Check your connection and try again."
            >
              <button type="button" onClick={() => setAttempt((value) => value + 1)} className="craves-primary-action">
                <RefreshCw className="h-5 w-5" aria-hidden="true" />
                Try again
              </button>
            </EmptyState>
          )}
        </main>
      </div>
    );
  }

  const { profile, dishes, delivery, address } = page;
  const name = profile.displayName || profile.kitchenName;
  const location = kitchenLocation([profile.areaName, profile.city, profile.state]);
  const subtitle = [
    profile.displayName && profile.displayName !== profile.kitchenName ? profile.kitchenName : null,
    location,
    kitchenJoinedLabel(profile.createdAt),
  ].filter(Boolean).join(" · ");
  const facts = [
    dishes.length ? `${dishes.length} ${dishes.length === 1 ? "dish" : "dishes"}` : null,
    kitchenFoodMixLabel(dishes),
    formatPreparationTime(dishes),
    reviewSummary && reviewSummary.reviewCount > 0 && reviewSummary.overallAverage !== null
      ? `${reviewSummary.overallAverage.toFixed(1)} ★ · ${reviewSummary.reviewCount} ${reviewSummary.reviewCount === 1 ? "review" : "reviews"}`
      : null,
  ].filter((fact): fact is string => Boolean(fact));
  const bio = profile.description;
  const reviews = dishes.flatMap((dish) => dish.reviews ?? []);

  return (
    <div
      className={`min-h-screen bg-white text-[#1A1A1A] ${cartSummary.itemCount > 0 ? "pb-32" : "pb-14"}`}
      onClickCapture={rememberScroll}
    >
      <KitchenHeader
        kitchenId={profile.id}
        name={name}
        chefPhotoUrl={profile.chefPhotoUrl}
        photos={profile.kitchenPhotoUrls}
        solid={pastTitle}
        onBack={handleBack}
      />

      <main className="mx-auto max-w-6xl px-4 md:px-6">
        <section className="relative z-10">
          <ChefFace
            photoUrl={profile.chefPhotoUrl}
            name={name}
            size={92}
            className="-mt-[46px] flex bg-[#FFF5E9] font-extrabold text-[#D92714] shadow-[0_6px_14px_rgba(38,26,21,0.08)]"
          />
          <h1 ref={titleRef} className="mt-2 font-display text-3xl font-black tracking-[-0.045em] text-[#1A1A1A] md:text-4xl">
            {name}
          </h1>
          {subtitle ? <p className="mt-1 text-sm font-semibold text-[#6B6B6B]">{subtitle}</p> : null}
          {facts.length ? (
            <ul className="mt-3 flex flex-wrap gap-2" aria-label="About this kitchen">
              {facts.map((fact) => (
                <li key={fact} className="rounded-full bg-[#F1F3F5] px-3 py-1.5 text-xs font-bold text-[#1A1A1A]">{fact}</li>
              ))}
            </ul>
          ) : null}
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
          {delivery === "no" || delivery === "no-address" ? (
            // Said plainly, and Add stays off while the kitchen is out of reach.
            <div role="status" className="mt-4 flex max-w-3xl items-start gap-3 rounded-2xl bg-[#FDEAE8] p-4">
              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-[#D92714]" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-[0.9375rem] font-bold text-[#261A15]">
                  {delivery === "no"
                    ? `This kitchen doesn't deliver to ${placeName(address)} yet`
                    : "Choose a delivery address to order from this kitchen"}
                </p>
                <p className="mt-1 text-sm leading-6 text-[#6B6B6B]">
                  {delivery === "no"
                    ? "It's outside the 10 km Craves browsing area for your selected address. You can still look at the menu."
                    : "We'll check that it delivers to you."}
                </p>
                <button
                  type="button"
                  onClick={changeAddress}
                  className="mt-1 !min-h-11 !min-w-0 !border-0 !bg-transparent !p-0 text-[0.9375rem] font-bold !text-[#D92714] underline-offset-4 !shadow-none hover:underline"
                >
                  {delivery === "no" ? "Change delivery address" : "Choose location"}
                </button>
              </div>
            </div>
          ) : null}
        </section>

        {dishes.length ? (
          <KitchenMenu dishes={dishes} orderable={delivery !== "no" && delivery !== "no-address"} />
        ) : (
          <NoDishes kitchenId={profile.id} name={name} />
        )}
        {reviews.length > 0 ? (
          <CustomerReviewsSection reviews={reviews} />
        ) : null}
      </main>

      <CustomerFloatingCart />
    </div>
  );
}

export default ChefProfilePage;
