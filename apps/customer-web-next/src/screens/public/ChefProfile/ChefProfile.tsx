import { getRouteApi, useNavigate, Link } from "@tanstack/react-router";
import { getChef, getDishesByChef } from "@/services/api/chefs";
import { ChefProfileHeader } from "@/components/chef/ChefProfileHeader";
import { ChefProfileHero } from "@/components/chef/ChefProfileHero";
import { ChefStatsRow } from "@/components/chef/ChefStatsRow";
import { ChefAboutSection } from "@/components/chef/ChefAboutSection";
import { ChefDishesGrid } from "@/components/chef/ChefDishesGrid";
import { CustomerReviewsSection } from "@/components/order/CustomerReviewsSection";

// Route metadata (head tags, etc.) consumed by src/routes/chef.$id.tsx
export const routeMeta = {
  head: ({ params }: { params: { id: string } }) => {
    const chef = getChef(params.id);
    return {
      meta: [
        { title: chef ? `${chef.name} – Craves` : "Chef – Craves" },
        {
          name: "description",
          content: chef
            ? `${chef.name} · ${chef.rating}★ · Verified home chef on Craves.`
            : "Chef profile on Craves.",
        },
        { name: "robots", content: "noindex" },
      ],
    };
  },
};

// Gives access to this route's params/search/etc. from outside the route file
// (the real `Route` object now lives in src/routes/chef.$id.tsx)
const routeApi = getRouteApi("/chef/$id");

/**
 * Public chef profile page — lets a customer verify a chef's rating, review
 * count, experience and see everything that chef cooks, before ordering.
 * Composed of named pieces from src/components/chef/.
 */
function ChefProfilePage() {
  const { id } = routeApi.useParams();
  const navigate = useNavigate();
  const chef = getChef(id);

  if (!chef) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream px-4 text-center">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Chef not found</h1>
          <Link to="/home" className="btn-primary mt-6 inline-flex">
            Back to menu
          </Link>
        </div>
      </div>
    );
  }

  const dishes = getDishesByChef(chef.name);

  return (
    <div className="min-h-screen bg-cream pb-10">
      <ChefProfileHeader onBack={() => navigate({ to: "/home" })} />
      <main className="mx-auto max-w-3xl px-4 pt-6 md:px-6">
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
