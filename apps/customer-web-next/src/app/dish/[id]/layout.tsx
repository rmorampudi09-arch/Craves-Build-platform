import type { Metadata } from "next";
import type { ReactNode } from "react";

import { dishShareMetadata } from "@/features/seo/lib/share-metadata";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  // Real name and photo make shared links (WhatsApp, Instagram, Facebook) show a rich preview.
  return (await dishShareMetadata(id)) ?? { title: "Dish details | Craves" };
}

export default function DishItemLayout({ children }: { children: ReactNode }) {
  return children;
}
