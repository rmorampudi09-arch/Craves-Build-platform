import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Images,
  MapPin,
  PackageCheck,
  UtensilsCrossed,
} from "lucide-react";
import { hasHomeReturnState } from "@/lib/home-return-state";
import {
  getChef,
  getDishesByChef,
  type Chef,
} from "@/services/api/chefs";
import { discoverDishes, loadKitchenMenu } from "@/services/api/dishes";
import {
  loadSelectedAddress,
  loadSession,
} from "@/services/auth/cravesAuth";
import { DetailBrowseHeader } from "@/components/navigation/DetailBrowseHeader";
import { ChefDishesGrid } from "@/components/chef/ChefDishesGrid";
import { CustomerReviewsSection } from "@/components/order/CustomerReviewsSection";

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
  const [chef, setChef] = useState<Chef | undefined>(() => getChef(id));
  const [loading, setLoading] = useState(!chef);
  const [message, setMessage] = useState("");
  const [photoNotice, setPhotoNotice] = useState(false);

  useEffect(() => {
    let active = true;
    const cachedChef = getChef(id);
    if (cachedChef) {
      setChef(cachedChef);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setMessage("");
    setPhotoNotice(false);

    void (async () => {
      const session = await loadSession();
      if (!session) {
        navigate({ to: "/" });
        return;
      }

      let resolved = getChef(id);
      try {
        await loadKitchenMenu(id);
        resolved = getChef(id);
      } catch {
        // Older customer links can still recover from location discovery.
      }

      if (!resolved) {
        const address = await loadSelectedAddress();
        if (
          typeof address?.lat === "number" &&
          typeof address.lng === "number"
        ) {
          await discoverDishes(address.lat, address.lng);
          resolved = getChef(id);
        }
      }
      if (active) setChef(resolved);
    })()
      .catch((error) => {
        if (active) {
          setMessage(
            error instanceof Error
              ? error.message
              : "Kitchen details could not be loaded.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
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
    return (
      <div className="min-h-screen bg-white px-4 py-10">
        <div className="mx-auto max-w-6xl animate-pulse" aria-hidden="true">
          <div className="h-44 rounded-[2rem] bg-[#F1F3F5]" />
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((item) => (
              <div key={item} className="h-72 rounded-[1.75rem] bg-[#F1F3F5]" />
            ))}
          </div>
        </div>
        <p className="sr-only" role="status">Loading this home kitchen…</p>
      </div>
    );
  }

  if (!chef) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white px-4 text-center">
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
            Back to Craves
          </button>
        </div>
      </div>
    );
  }

  const dishes = getDishesByChef(chef.name);
  const fallbackDescription = chef.specialties.length
    ? `Explore ${chef.specialties.join(", ")} and other home-cooked dishes currently available from this kitchen.`
    : "Explore the home-cooked dishes currently available from this kitchen on Craves.";

  return (
    <div className="min-h-screen bg-white pb-14 text-[#1A1A1A]">
      <DetailBrowseHeader returnPath={`/kitchen/${id}`} />

      <main className="mx-auto max-w-6xl px-4 pt-5 md:px-6 md:pt-7">
        <section className="rounded-[1.75rem] border border-[#E5E7EB] bg-white p-5 shadow-[0_10px_30px_rgba(26,26,26,0.045)] sm:p-6 md:rounded-[2rem] md:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-[0.68rem] font-black uppercase tracking-[0.16em] text-[#F62E18]">
                Craves home kitchen
              </p>
              <h1 className="mt-2 font-display text-3xl font-black tracking-[-0.045em] text-[#261A15] md:text-4xl">
                {chef.name}
              </h1>
              {chef.location ? (
                <p className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-[#6B6B6B]">
                  <MapPin className="h-4 w-4 text-[#F62E18]" aria-hidden="true" />
                  {chef.location}
                </p>
              ) : null}
              <p className="mt-4 max-w-2xl text-sm leading-6 text-[#6B6B6B] sm:text-[0.95rem]">
                {chef.bio || fallbackDescription}
              </p>

              <button
                type="button"
                onClick={() => setPhotoNotice((visible) => !visible)}
                className="!mt-5 !inline-flex !min-h-11 !items-center !gap-2 !rounded-full !border !border-[#E5E7EB] !bg-white !px-4 !text-sm !font-black !text-[#1A1A1A] !shadow-[0_5px_14px_rgba(26,26,26,0.05)] transition hover:!-translate-y-0.5 hover:!border-[#F62E18]/35 hover:!text-[#F62E18]"
                aria-expanded={photoNotice}
              >
                <Images className="h-4 w-4 text-[#F62E18]" aria-hidden="true" />
                Kitchen photos
              </button>
              {photoNotice ? (
                <p
                  role="status"
                  className="mt-2 max-w-md rounded-2xl bg-[#F1F3F5] px-3.5 py-2.5 text-xs font-semibold leading-5 text-[#6B6B6B]"
                >
                  Kitchen photos are not available from this kitchen yet.
                </p>
              ) : null}
            </div>

            <div className="grid shrink-0 grid-cols-2 gap-2.5 sm:grid-cols-3 lg:w-[25rem]">
              <div className="rounded-2xl bg-[#F1F3F5] p-3.5">
                <UtensilsCrossed className="h-4 w-4 text-[#F62E18]" aria-hidden="true" />
                <p className="mt-2 text-lg font-black text-[#1A1A1A]">{chef.activeDishCount}</p>
                <p className="text-[0.68rem] font-bold text-[#6B6B6B]">Dishes available</p>
              </div>
              <div className="rounded-2xl bg-[#F1F3F5] p-3.5">
                <PackageCheck className="h-4 w-4 text-[#F62E18]" aria-hidden="true" />
                <p className="mt-2 text-sm font-black text-[#1A1A1A]">Made to order</p>
                <p className="mt-1 text-[0.68rem] font-bold text-[#6B6B6B]">Prepared after you order</p>
              </div>
              <div className="col-span-2 rounded-2xl bg-[#F1F3F5] p-3.5 sm:col-span-1">
                <p className="text-[0.65rem] font-black uppercase tracking-[0.08em] text-[#F62E18]">Menu</p>
                <p className="mt-2 text-sm font-black text-[#1A1A1A]">
                  {chef.specialties.length > 0
                    ? chef.specialties.slice(0, 2).join(" · ")
                    : "Home-cooked dishes"}
                </p>
              </div>
            </div>
          </div>
        </section>

        <ChefDishesGrid chefName={chef.name} dishes={dishes} />
        {chef.reviews.length > 0 ? (
          <CustomerReviewsSection reviews={chef.reviews} />
        ) : null}
      </main>
    </div>
  );
}

export default ChefProfilePage;
