import Link from "next/link";
import { ChefOrderDetails } from "@/components/chef-order-details";

export const metadata = { title: "Chef order | Craves", robots: { index: false, follow: false } };

export default async function ChefOrderPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  return <main className="mx-auto min-h-screen max-w-5xl px-5 py-12 sm:px-8"><Link href="/chef/orders" className="text-sm font-semibold text-[#F6B545]">← Chef orders</Link><h1 className="mt-5 text-4xl font-bold text-white sm:text-5xl">Order details</h1><div className="mt-8"><ChefOrderDetails orderId={orderId} /></div></main>;
}
