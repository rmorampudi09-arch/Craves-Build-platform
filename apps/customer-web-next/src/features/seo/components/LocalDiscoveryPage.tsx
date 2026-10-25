import Link from "next/link";

import { StructuredData } from "@/features/seo/components/StructuredData";
import {
  areaSlug,
  cityStructuredData,
  foodIntents,
  launchCities,
  localFaq,
  nearbyAreas,
  type FoodIntent,
  type LaunchCity,
} from "@/features/seo/lib/seo-craves";

type LocalDiscoveryPageProps = {
  city?: LaunchCity;
  food?: FoodIntent;
  area?: string;
  mode: "city" | "city-food" | "city-area" | "food";
};

export function LocalDiscoveryPage({ city, food, area, mode }: LocalDiscoveryPageProps) {
  const place = city ? (area ? `${area}, ${city.name}` : city.name) : "";
  const title =
    mode === "city-area" && city && area
      ? `Homemade food in ${area}, ${city.name}`
      : mode === "city-food" && city && food
      ? `${food.name} in ${city.searchName}`
      : mode === "food" && food
        ? `${food.name} from Craves home chefs`
        : `Homemade food in ${city?.searchName ?? "your city"}`;
  const intro =
    mode === "city-area" && city && area
      ? `Craves brings fresh homemade food from trusted home chefs to ${area}, ${city.name}. Browse nearby kitchens, order biryani, tiffin, breakfast, lunch and dinner cooked at home, pay securely, and track your delivery.`
      : mode === "city-food" && city && food
      ? `${food.description} Order from approved home kitchens across ${city.searchName}, from ${city.neighborhoods.slice(0, 3).join(", ")} to ${city.neighborhoods.at(-1)}.`
      : mode === "food" && food
        ? `${food.description} Available from home chefs in ${launchCities.map((item) => item.name).join(" and ")}.`
        : `Craves is where ${city?.searchName} orders homemade food. Browse trusted home chefs near you, see what they are cooking today, pay securely and track every order to your door.`;
  const faq = city ? localFaq(city, food, area) : [];
  const nearby = city && area ? nearbyAreas(city, area) : [];

  return (
    <main className="min-h-screen bg-white text-[#2B1A12]">
      {city ? <StructuredData data={cityStructuredData(city, food, area)} /> : null}
      <header className="border-b border-black/5">
        <div className="mx-auto flex min-h-20 max-w-6xl items-center justify-between px-4 md:px-6">
          <Link href="/" className="font-display text-2xl font-black text-[#F62E18]">
            CRAVES
          </Link>
          <Link href="/home" className="rounded-full bg-[#F62E18] px-5 py-2.5 text-sm font-bold text-white">
            Order now
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-12 md:px-6 md:py-16">
        {city ? (
          <nav aria-label="Breadcrumb" className="text-xs font-semibold text-black/50">
            <Link href="/" className="hover:text-[#F62E18]">Craves</Link>
            {" / "}
            <Link href={`/${city.slug}`} className="hover:text-[#F62E18]">{city.name}</Link>
            {area || food ? <>{" / "}<span aria-current="page">{area ?? food?.name}</span></> : null}
          </nav>
        ) : null}
        <h1 className="mt-3 max-w-3xl font-display text-4xl font-black md:text-5xl">
          {title}
        </h1>
        <p className="mt-5 max-w-3xl text-base leading-7 text-black/65">
          {intro}
        </p>
        <Link
          href="/home"
          className="mt-7 inline-block rounded-full bg-[#F62E18] px-6 py-3 text-sm font-bold text-white"
        >
          {place ? `See kitchens cooking near ${place}` : "See kitchens cooking near you"}
        </Link>

        <div className="mt-10 grid gap-5 md:grid-cols-3">
          <article className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
            <h2 className="font-display text-2xl font-bold">Cooked at home</h2>
            <p className="mt-3 text-sm leading-6 text-black/60">
              Every dish comes from an approved home kitchen, not a cloud kitchen. See the chef, their menu, ratings and reviews before you order.
            </p>
          </article>
          <article className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
            <h2 className="font-display text-2xl font-bold">Clear prices</h2>
            <p className="mt-3 text-sm leading-6 text-black/60">
              See the final total before you pay, then pay securely online.
            </p>
          </article>
          <article className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
            <h2 className="font-display text-2xl font-bold">Tracked to your door</h2>
            <p className="mt-3 text-sm leading-6 text-black/60">
              Follow your order from the kitchen to your address, with support if anything goes wrong.
            </p>
          </article>
        </div>

        {city ? (
          <section className="mt-10">
            <h2 className="font-display text-2xl font-bold">
              {area ? `Popular food near ${area}` : `Popular food in ${city.name}`}
            </h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {foodIntents.map((item) => (
                <Link
                  key={item.slug}
                  href={`/${city.slug}/${item.slug}`}
                  aria-current={item.slug === food?.slug ? "page" : undefined}
                  className="rounded-2xl border border-black/10 p-4 text-sm font-semibold text-black/75 transition hover:border-[#D7DADF] hover:text-[#F62E18]"
                >
                  {area ? `${item.name} near ${area}` : `${item.name} in ${city.name}`}
                </Link>
              ))}
            </div>
          </section>
        ) : (
          <section className="mt-10">
            <h2 className="font-display text-2xl font-bold">
              {food ? `Order ${food.name.toLowerCase()} in your city` : "Choose your city"}
            </h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {launchCities.map((item) => (
                <Link
                  key={item.slug}
                  href={food ? `/${item.slug}/${food.slug}` : `/${item.slug}`}
                  className="rounded-2xl border border-black/10 p-4 text-sm font-semibold text-black/75 transition hover:border-[#D7DADF] hover:text-[#F62E18]"
                >
                  {food ? `${food.name} in ${item.name}` : item.name}
                </Link>
              ))}
            </div>
          </section>
        )}

        {nearby.length ? (
          <section className="mt-10">
            <h2 className="font-display text-2xl font-bold">Also delivering near {area}</h2>
            <ul className="mt-4 flex flex-wrap gap-2">
              {nearby.map((item) => (
                <li key={item}>
                  <Link
                    href={`/${city!.slug}/${areaSlug(item)}`}
                    className="inline-block rounded-full border border-black/10 px-4 py-2 text-sm font-semibold text-black/70 hover:text-[#F62E18]"
                  >
                    Homemade food in {item}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {faq.length ? (
          <section className="mt-10">
            <h2 className="font-display text-2xl font-bold">Questions about Craves in {place}</h2>
            <dl className="mt-5 grid gap-4">
              {faq.map((item) => (
                <div key={item.question} className="rounded-2xl border border-black/10 p-5">
                  <dt className="font-bold">{item.question}</dt>
                  <dd className="mt-2 text-sm leading-6 text-black/65">{item.answer}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}

        {city ? (
          <section className="mt-10 rounded-3xl bg-[#F1F3F5] p-7">
            <h2 className="font-display text-2xl font-bold">
              Homemade food across {city.name}
            </h2>
            <ul className="mt-4 flex flex-wrap gap-2">
              {city.neighborhoods.map((item) => (
                <li key={item}>
                  <Link
                    href={`/${city.slug}/${areaSlug(item)}`}
                    aria-current={item === area ? "page" : undefined}
                    className="inline-block rounded-full bg-white px-4 py-2 text-sm font-semibold text-black/70 hover:text-[#F62E18]"
                  >
                    {item}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </section>
    </main>
  );
}
