import Link from "next/link";
import { AdminChefReviewDetails } from "@/components/admin-chef-review-details";
import { isUuid } from "@/lib/server-api";

export const metadata = { title: "Chef review details | Craves Admin", robots: { index: false, follow: false } };

export default async function AdminChefReviewDetailsPage({ params }: { params: Promise<{ applicationId: string }> }) {
  const { applicationId } = await params;
  return <main className="mx-auto min-h-screen max-w-5xl px-5 py-12 sm:px-8">
    <Link href="/admin/chef-reviews" className="text-sm font-semibold text-[#F6B545]">← Chef applications</Link>
    <h1 className="mt-8 text-4xl font-bold text-white sm:text-5xl">Review chef application.</h1>
    <div className="mt-8">{isUuid(applicationId) ? <AdminChefReviewDetails applicationId={applicationId} /> : <section className="rounded-[28px] bg-[#FFF8EC] p-6 text-slate-950">Invalid application ID.</section>}</div>
  </main>;
}
