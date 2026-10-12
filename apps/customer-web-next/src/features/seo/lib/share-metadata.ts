import type { Metadata } from "next";

import { isUuid, parsePublicMenuItemDetail } from "@/features/dish/lib/public-menu-item-contract";
import { publicApiFetch } from "@/shared/lib/public-api";

import { shareImage, siteUrl } from "./seo-craves";

// Short budget: a slow catalog must never delay the page, it only loses the rich preview.
const SHARE_FETCH_TIMEOUT_MS = 2_500;

async function publicJson(path: string): Promise<unknown> {
  try {
    const response = await publicApiFetch(path, {}, SHARE_FETCH_TIMEOUT_MS);
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 300) : null;
}

function placeLabel(areaName: string | null, city: string | null): string {
  return [areaName, city].filter(Boolean).join(", ");
}

export async function dishShareMetadata(id: string): Promise<Metadata | null> {
  if (!isUuid(id)) return null;
  const item = await publicJson(`/catalog/menu-items/${encodeURIComponent(id)}`);
  const kitchenId = item && typeof item === "object" && "kitchenId" in item ? String(item.kitchenId) : "";
  if (!isUuid(kitchenId)) return null;
  const detail = parsePublicMenuItemDetail(item, await publicJson(`/catalog/kitchens/${encodeURIComponent(kitchenId)}`));
  if (!detail) return null;

  const chef = detail.kitchenDisplayName ?? detail.kitchenName;
  const place = placeLabel(detail.areaName, detail.city);
  const title = `${detail.itemName} by ${chef}${place ? ` in ${place}` : ""} | Craves`;
  const description =
    detail.description ??
    `Order homemade ${detail.itemName.toLowerCase()} from ${chef}${place ? `, ${place}` : ""} on Craves: ₹${detail.price}, cooked fresh by a trusted home chef.`;
  const url = `${siteUrl}/dish/${detail.id}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: "Craves",
      locale: "en_IN",
      type: "website",
      images: [detail.primaryImageUrl ? { url: detail.primaryImageUrl, alt: detail.itemName } : shareImage],
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export async function kitchenShareMetadata(id: string, path: "kitchen" | "kitchens"): Promise<Metadata | null> {
  if (!isUuid(id)) return null;
  const kitchen = await publicJson(`/catalog/kitchens/${encodeURIComponent(id)}`);
  if (!kitchen || typeof kitchen !== "object") return null;
  // Allow-list only public kitchen fields; the DTO also carries contact and pickup details.
  const raw = kitchen as Record<string, unknown>;
  const name = text(raw.displayName) ?? text(raw.kitchenName);
  if (!name) return null;

  const place = placeLabel(text(raw.areaName), text(raw.city));
  const title = `${name} – Homemade Food${place ? ` in ${place}` : ""} | Craves`;
  const description =
    text(raw.description) ??
    `Order fresh homemade food from ${name}${place ? `, a home kitchen in ${place}` : ""} on Craves.`;
  const url = `${siteUrl}/${path}/${id}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: "Craves", locale: "en_IN", type: "website", images: [shareImage] },
    twitter: { card: "summary_large_image", title, description },
  };
}
