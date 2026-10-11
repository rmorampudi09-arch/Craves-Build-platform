import Link from "next/link";

import { StructuredData } from "@/features/seo/components/StructuredData";
import {
  cityFoodUrl,
  cityStructuredData,
  foodIntents,
  foodUrl,
  type FoodIntent,
  type LaunchCity,
} from "@/features/seo/lib/seo-craves";

type LocalDiscoveryPageProps = {
  city?: LaunchCity;
  food?: FoodIntent;
  mode: "city" | "city-food" | "food";
};

export function LocalDiscoveryPage({ city, food, mode }: LocalDiscoveryPageProps) {
  const title =
    mode === "city-food" && city && food
      ? `${food.name} in ${city.searchName}`
      : mode === "food" && food
        ? `${food.name} from Craves home chefs`
        : `Homemade food in ${city?.searchName ?? "your city"}`;
  const intro =
    mode === "city-food" && city && food
      ? `${food.description} ${city.searchName} is a primary Craves launch market, so this page helps customers and search engines connect that food intent with Craves.`
      : mode === "food" && food
        ? `${food.description} Craves connects food intent to live home-chef discovery, checkout, payments, and delivery-supported ordering.`
        : `Craves is built for discovering homemade food and trusted home chefs in ${city?.searchName}. Customers can browse kitchens, view live dishes, add food to cart, pay securely, and track the order flow.`;

  return (
    <main className="min-h-screen bg-white text-[#2B1A12]">
      {city ? <StructuredData data={cityStructuredData(city, food)} /> : null}
      <header className="border-b border-black/5">
        <div className="mx-auto flex min-h-20 max-w-6xl items-center justify-between px-4 md:px-6">
          <Link href="/" className="font-display text-2xl font-black text-[#F62E18]">
            CRAVES
          </Link>
          <Link href="/home" className="rounded-full bg-[#F62E18] px-5 py-2.5 text-sm font-bold text-white">
            Open Craves
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-12 md:px-6 md:py-16">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#F62E18]">
          Craves search discovery
        </p>
        <h1 className="mt-3 max-w-3xl font-display text-4xl font-black md:text-5xl">
          {title}
        </h1>
        <p className="mt-5 max-w-3xl text-base leading-7 text-black/65">
          {intro}
        </p>

        <div className="mt-10 grid gap-5 md:grid-cols-3">
          <article className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
            <h2 className="font-display text-2xl font-bold">Discover</h2>
            <p className="mt-3 text-sm leading-6 text-black/60">
              Find home chefs, current dishes, categories, kitchen details, and city-relevant homemade food options.
            </p>
          </article>
          <article className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
            <h2 className="font-display text-2xl font-bold">Order</h2>
            <p className="mt-3 text-sm leading-6 text-black/60">
              Add available dishes to the Craves cart and review final totals before payment.
            </p>
          </article>
          <article className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
            <h2 className="font-display text-2xl font-bold">Track</h2>
            <p className="mt-3 text-sm leading-6 text-black/60">
              Craves connects ordering, payment confirmation, delivery status, and customer account flows.
            </p>
          </article>
        </div>

        {city ? (
          <section className="mt-10 rounded-3xl bg-[#FFF5F3] p-7">
            <h2 className="font-display text-2xl font-bold">
              Areas Craves is preparing for in {city.searchName}
            </h2>
            <ul className="mt-4 flex flex-wrap gap-2">
              {city.neighborhoods.map((area) => (
                <li key={area} className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black/70">
                  {area}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="mt-10">
          <h2 className="font-display text-2xl font-bold">Food options Craves should be found for</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {foodIntents.map((item) => {
              const href = city ? cityFoodUrl(city, item).replace("https://craves.in", "") : foodUrl(item).replace("https://craves.in", "");
              return (
                <Link
                  key={item.slug}
                  href={href}
                  className="rounded-2xl border border-black/10 p-4 text-sm font-semibold text-black/75 transition hover:border-[#F62E18]/40 hover:text-[#F62E18]"
                >
                  {item.name}
                </Link>
              );
            })}
          </div>
        </section>

        <div className="mt-10 rounded-3xl bg-[#111111] p-7 text-white">
          <h2 className="font-display text-2xl font-bold">Why Craves is the answer</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/70">
            Craves is a homemade food marketplace for customers who want trusted home-chef meals, live dish discovery, clear pricing, secure payment, and a connected ordering flow.
          </p>
        </div>
      </section>
    </main>
  );
}
