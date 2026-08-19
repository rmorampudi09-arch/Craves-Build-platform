import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PersistentCustomerServiceNav } from "@/components/navigation/PersistentCustomerServiceNav";
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
import { ChefProfileHeader } from "@/components/chef/ChefProfileHeader";
import { ChefProfileHero } from "@/components/chef/ChefProfileHero";
import { ChefStatsRow } from "@/components/chef/ChefStatsRow";
import { ChefAboutSection } from "@/components/chef/ChefAboutSection";
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

    void (async () => {
      const session = await loadSession();
      if (!session) {
        navigate({ to: "/" });
        return;
      }

      let resolved = getChef(id);
      if (!resolved) {
        try {
          await loadKitchenMenu(id);
          resolved = getChef(id);
        } catch {
          // Older customer links can still recover from location discovery.
        }
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
      <div className="flex min-h-screen items-center justify-center bg-white px-4 text-center">
        <div role="status">
          <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-[#F1F3F5] border-t-[#F62E18]" />
          <p className="mt-4 text-sm font-bold text-[#6B6B6B]">Loading this home kitchen…</p>
        </div>
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
          <button type="button" onClick={handleBack} className="!mt-6 !inline-flex !min-h-11 !items-center !rounded-full !bg-[#F62E18] !px-5 !text-sm !font-black !text-white">
            Back to Craves
          </button>
        </div>
      </div>
    );
  }

  const dishes = getDishesByChef(chef.name);

  return (
    <div className="min-h-screen bg-white pb-12 text-[#1A1A1A]">
      <ChefProfileHeader onBack={handleBack} />
      <div className="border-b border-[#E5E7EB] bg-white">
        <div className="mx-auto max-w-5xl px-4 py-3 md:px-6">
          <PersistentCustomerServiceNav />
        </div>
      </div>
      <main className="mx-auto max-w-5xl px-4 pt-7 md:px-6 md:pt-9">
        <ChefProfileHero chef={chef} />
        <ChefStatsRow chef={chef} />
        <ChefAboutSection chef={chef} />
        <ChefDishesGrid chefName={chef.name} dishes={dishes} />
        <CustomerReviewsSection reviews={chef.reviews} />
      </main>
    </div>
  );
}

export default ChefProfilePage;
